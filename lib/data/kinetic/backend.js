import async from 'async';
import crypto from 'crypto';
import config from '../../Config';
import kinetic from 'kineticlib';
import { Logger } from 'werelogs';
import stream from 'stream';

const specialKeys = [];
let sequence = 1;
const maxSize = 1048576;
const logger = new Logger('KineticDataBackend', {
    logLevel: config.log.logLevel,
    dumpLevel: config.log.dumpLevel,
});

function createLogger(reqUids) {
    return reqUids ?
        logger.newRequestLoggerFromSerializedUids(reqUids) :
        logger.newRequestLogger();
}

function putKinetic(socket, size, value, log, callback) {
    const key = crypto.randomBytes(20);
    const pdu = new kinetic.PutPDU(sequence, key, value.length);
    ++sequence;

    socket.write(pdu.read());
    return socket.write(value, () => {
        return kinetic.streamToPDU(socket, (err, pdu) => {
            if (err) {
                log.error('error writing data', { error: err });
                return callback(err);
            }
            const status = pdu.getStatusCode();
            if (status !== kinetic.errors.SUCCESS) {
                log.error('error from kinetic drive',
                          { error: pdu.getErrorMessage(status) });
                return callback(pdu.getErrorMessage(status));
            }
            log.info('data put in the drive', { key });
            return callback(null, key);
        });
    });
}

function splitBuffer(buffer, size, partSize, log) {
    const buffers = [];
    let valueSize = 0;
    for (let i = 0; i < size; i += partSize) {
        valueSize = i + partSize > size ? size - i : partSize;
        buffers.push([valueSize, buffer.slice(i, i + partSize)]);
    }
    log.info(`data splitted`, { nbParts: buffers.length });
    return { buffers, nbParts: buffers.length };
}

const backend = {
    put: function putK(
        request, size, keyContext, reqUids, callback, socket) {
        const log = createLogger(reqUids);
        let value = new Buffer(0);
        request.on('data', data => value = Buffer.concat([value, data]))
            .on('end', () => {
                if (value.length < maxSize) {
                    putKinetic(socket, value.length, value, log, callback);
                } else {
                    log.info(`data > ${maxSize}, splitting in multipart`,
                             { size: value.length });
                    let i = 0;
                    const keysArray = [];
                    const valueObj = splitBuffer(value, size, 1000000, log);


                    async.eachSeries(valueObj.buffers, (value, next) => {
                        log.info('value of i', { i });
                        i++;
                        putKinetic(
                            socket, value[0], value[1], log, (err, key) => {
                                if (err) {
                                    return next(err);
                                }
                                keysArray.push(key);
                                return next(null, 'test');
                            });
                    }, (err, end) => {
                        log.info('end of eachSeries call', { err, end });
                        const keysToStore = Buffer.concat(keysArray);
                        log.info('keyToStore',
                                 { keysToStore, len: keysToStore.length });
                        putKinetic(
                            socket, keysToStore.length,
                            keysToStore, log, (err, key) => {
                                if (err) {
                                    return callback(err);
                                }
                                log.info('finalKey ---',
                                         { key, len: key.length });
                                specialKeys.push(key);
                                return callback(null, key);
                            });
                    });
                }
            });
    },

    get: function getKinetic(key, range, reqUids, callback, socket) {
        let value = new Buffer(0);
        const keyValue = new Buffer(key.data);
        const log = createLogger(reqUids);

        log.info('key.slice(4), new Buffer("part") ',
                 { keySlice: keyValue.slice(4), buffer: new Buffer('part') });
        if (specialKeys.indexOf(keyValue) < 0) {
            log.info(`getting chunk < ${maxSize}`);
            const pdu = new kinetic.GetPDU(sequence, keyValue);
            ++sequence;

            socket.write(pdu.read());
            kinetic.streamToPDU(socket, (err, pdu) => {
                if (err) {
                    return callback(err);
                }
                pdu.getStatusCode();
                if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                    return callback(kinetic.getErrorName(pdu.getStatusCode()));
                }

                socket.resume();
                return socket.on('data', chunk => {
                    value = Buffer.concat([value, chunk]);
                    if (value.length === pdu.getChunkSize()) {
                        const val = new stream.Readable({
                            read: function read() {
                                this.push(value);
                                this.push(null);
                            },
                        });
                        return callback(null, val);
                    }
                });
            });
        } else {
            log.info(`getting chunk > ${maxSize}`);
            async.eachSeries(
                splitBuffer(keyValue, keyValue.length, 20, log), (key, next) => {
                    const pdu = new kinetic.GetPDU(sequence, key);
                    ++sequence;

                    socket.write(pdu.read());
                    kinetic.streamToPDU(socket, (err, pdu) => {
                        if (err) {
                            return callback(err);
                        }
                        if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                            return callback(kinetic.getErrorName(pdu.getStatusCode()));
                        }

                        socket.resume();
                        return socket.on('data', chunk => {
                            value = Buffer.concat([value, chunk]);
                            if(value.length === pdu.getChunkSize()) {
                                next(null, 'test');
                            }
                        });
                    });
                }, (err, end) => {
                    const val = new stream.Readable({
                        read: function read() {
                            this.push(value);
                            this.push(null);
                        },
                    });
                    return callback(null, val);
                });
        }
    },

    delete: function delKinetic(key, reqUids, callback, socket) {
        if (!Buffer.isBuffer(key)) {
            key = new Buffer(key.data);
        }
        const pdu = new kinetic.DeletePDU(sequence, key);
        ++sequence;
        socket.write(pdu.read());

        kinetic.streamToPDU(socket, (err, pdu) => {
            if (err) {
                return callback(err);
            }
            if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                return callback(kinetic.getErrorName(pdu.getStatusCode()));
            }
        });
    },
};

export default backend;

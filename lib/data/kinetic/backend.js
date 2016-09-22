import async from 'async';
import crypto from 'crypto';
import config from '../../Config';
import kinetic from 'kineticlib';
import { Logger } from 'werelogs';
import stream from 'stream';

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

function getKinetic(socket, key, log, callback) {
    let value = new Buffer(0);
    console.log('special ====== KEY')
    console.log(key);
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
            if (value.length === pdu.getChunkSize()) {
                const val = new stream.Readable({
                    read: function read() {
                        this.push(value);
                        this.push(null);
                    },
                });
                socket.pause();
                return callback(null, val);
            }
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
                                key = Buffer.concat([new Buffer('part'), key]);
                                return callback(null, key);
                            });
                    });
                }
            });
    },

    get: function getK(key, range, reqUids, callback, socket) {
        let value = new Buffer(0);
        let keyValue = new Buffer(key.data);
        const log = createLogger(reqUids);
        let isBig = false;

        console.log('');
        console.log('KEY');
        console.log(key);
        console.log('the keyValue');
        console.log(keyValue);
        console.log('');
        console.log();
        console.log('');

        if (keyValue.slice(0, 4).toString() !== 'part') {
            log.info(`getting chunk < ${maxSize}`);
            getKinetic(socket, keyValue, log, callback);
        } else {
            log.info(`getting chunk > ${maxSize}`);
            keyValue = keyValue.slice(4);
            console.log('----- keyValue -----');
            console.log(keyValue)
            getKinetic(socket, keyValue, log, (err, globalKey) => {
                console.log('GLOBAL KEYS --------');
                console.log(globalKey)
                const keyTab = splitBuffer(globalKey, globalKey.length, 20, log);
                async.eachSeries(keyTab, (key, next) => {
                    console.log('tab of keys');
                    console.log(keyTab);
                    const pdu = new kinetic.GetPDU(sequence, key);
                    ++sequence;

                    socket.write(pdu.read());
                    kinetic.streamToPDU(socket, (err, pdu) => {
                        if (err) {
                            return next(err);
                        }
                        if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                            return next(
                                kinetic.getErrorName(pdu.getStatusCode()));
                        }

                        socket.resume();
                        return socket.on('data', chunk => {
                            value = Buffer.concat([value, chunk]);
                            if(value.length === pdu.getChunkSize()) {
                                next(null);
                            }
                        });
                    });
                }, (err, end) => {
                    if (err) {
                        return callback(err);
                    }
                    const val = new stream.Readable({
                        read: function read() {
                            this.push(value);
                            this.push(null);
                        },
                    });
                    return callback(null, val);
                });



            });





            // const pdu3 = new kinetic.GetPDU(sequence, keyValue);
            // ++sequence;

            // socket.write(pdu3.read());
            // kinetic.streamToPDU(socket, (err, pdu) => {
            //     if (err) {
            //         return callback(err);
            //     }
            //     pdu.getStatusCode();
            //     if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
            //         return callback(kinetic.getErrorName(pdu.getStatusCode()));
            //     }

            //     socket.resume();
            //     return socket.on('data', chunk => {
            //         value1 = Buffer.concat([value1, chunk]);
            //         if (value1.length === pdu.getChunkSize()) {
            //             keyToTest = value1;
            //             console.log('keyToTest');
            //             console.log(keyToTest);
            //             console.log('');
            //         }
            //     });
            // });



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

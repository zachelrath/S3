import async from 'async';
import crypto from 'crypto';
import config from '../../Config';
import kinetic from 'kineticlib';
import { Logger } from 'werelogs';
import stream from 'stream';

let sequence = 1;
const maxSize = 1048576;
const logger = new Logger('FileDataBackend', {
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
            const status = pdu.getStatusCode();
            if (err) {
                log.error('error writing data', { error: err });
                return callback(err);
            }
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

function splitBuffer(buffer, size, partSize) {
    const buffers = [];
    let valueSize = 0;
    for (let i = 0; i < size; i += partSize) {
        valueSize = i + partSize > size ? size - i : partSize;
        buffers.push([valueSize, buffer.slice(i, i + partSize)]);
    }
    return buffers;
}

// function areBuffersEqual(bufA, bufB) {
//     const len = bufA.length;
//     if (len !== bufB.length) {
//         return false;
//     }
//     for (let i = 0; i < len; i++) {
//         if (bufA.readUInt8(i) !== bufB.readUInt8(i)) {
//             return false;
//         }
//     }
//     return true;
// }

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
                    const keysArray = [];
                    const valueTab = splitBuffer(value, size, 1000000);
                    async.mapLimit(valueTab, 5, (value, cb) => {
                        putKinetic(socket, value[0], value[1], (err, key) => {
                            if (err) {
                                return cb(err);
                            }
                            keysArray.push(key);
                            return cb(null, keysArray);
                        });
                    }, (err, result) => {
                        callback(null, result);
                    });
                }
            });
    },

    get: function getKinetic(key, range, reqUids, callback, socket) {
        let value = new Buffer(0);
        const pdu = new kinetic.GetPDU(sequence, new Buffer(key.data));
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
                            // sets this._read under the hood
                            // push data onto the read queue, passing null
                            // will signal the end of the stream (EOF)
                            // while (start < end) {
                            //     const finish =
                            //               Math.min(start + chunkSize, end);
                            //     this.push(storedBuffer.slice(start, finish));
                            //     start += chunkSize;
                            // }
                            // if (start >= end) {
                            this.push(value);
                            this.push(null);
                            // }
                        },
                    });
                    return callback(null, val);
                }
            });
        });
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

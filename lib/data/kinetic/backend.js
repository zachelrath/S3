import { errors, stringHash } from 'arsenal';
import crypto from 'crypto';
import fs from 'fs';
import config from '../../Config';
import kinetic from 'kineticlib';
import net from 'net';
import constants from '../../../constants';
import { Logger } from 'werelogs';
import util from 'util';

const logger = new Logger('FileDataBackend', {
    logLevel: config.log.logLevel,
    dumpLevel: config.log.dumpLevel,
});
function createLogger(reqUids) {
    return reqUids ?
        logger.newRequestLoggerFromSerializedUids(reqUids) :
        logger.newRequestLogger();
}

export const ds = [];
let count = 1; // keys are assessed with if (!key)

export function resetCount() {
    count = 1;
}

const backend = {
    put: function x(request, size,  keyContext, reqUids, callback, socket) {
        let value = new Buffer(0);
        const log = createLogger(reqUids);
        request.on('data', data => value = Buffer.concat([value, data]))
            .on('end', () => {
                const key = crypto.randomBytes(20);
                console.log('----port////host kinetic ----');
                console.log(
                    config.kinetic.port + ' //// ' + config.kinetic.host);
                const pdu = new kinetic.PutPDU(1, key, value.length);

                socket.write(pdu.read());
                socket.write(value);

                kinetic.streamToPDU(socket, (err, pdu) => {
                    if (err){
                        callback(err);
                    }
                    if (pdu.getStatusCode() !== kinetic.errors.SUCCESS){
                        callback(pdu.getErrorMessage());
                    }
                    callback(null, key);
                });
            });
    },

    get: function y(key, range, reqUids, callback, socket) {
        console.log('---------------key');
        console.log(key);
        console.log('---------------range');
        console.log(range);
        let value = new Buffer(0);
        const log = createLogger(reqUids);
        console.log('----port////host kinetic ----');
        console.log(
            config.kinetic.port + ' //// ' + config.kinetic.host);
        const pdu = new kinetic.GetPDU(2, key);

        socket.write(pdu.read());

        kinetic.streamToPDU(socket, (err, pdu) => {
            if (err){
                callback(err);
            }
            if (pdu.getStatusCode() !== kinetic.errors.SUCCESS){
                callback(kinetic.getErrorName(pdu.getStatusCode()));
            }
            console.log(util.inspect(
                pdu, {showHidden: false, depth: null}));
            socket.resume();
            socket.on('data', (chunk) => {
                value = Buffer.concat([value, chunk]);
                if (value.length === pdu.getChunkSize()){
                    callback(null, value);
                }
            });
        });
    },

    delete: function z(key, reqUids, callback) {
        const log = createLogger(reqUids);
        console.log('----port////host kinetic ----');
        console.log(
            config.kinetic.port + ' //// ' + config.kinetic.host);
        const socket = new net.Socket().pause();
        socket.connect(config.kinetic.port, () => {
            kinetic.streamToPDU(socket, (err, response) => {
                if (err){
                    callback(err);
                }
                if (response.getStatusCode() === kinetic.errors.SUCCESS){
                    const pdu = new kinetic.DeletePDU(1, key.toString());

                    socket.write(pdu.read());

                    kinetic.streamToPDU(socket, (err, pdu) => {
                        if (err){
                            callback(err);
                        }
                        console.log(util.inspect(
                            pdu, {showHidden: false, depth: null}));
                        if (pdu.getStatusCode() !== kinetic.errors.SUCCESS){
                            callback(kinetic.getErrorName(pdu.getStatusCode()));
                        }
                        callback(null);
                    });
                };
            });
        });
    },
}

//     get: function getMem(key, range, reqUids, callback) {
//         process.nextTick(() => {
//             if (!ds[key]) { return callback(errors.NoSuchKey); }
//             const storedBuffer = ds[key].value;
//             // If a range was sent, use the start from the range.
//             // Otherwise, start at 0
//             let start = range ? range[0] : 0;
//             // If a range was sent, use the end from the range.
//             // End of range should be included so +1
//             // Otherwise, get the full length
//             const end = range ? range[1] + 1 : storedBuffer.length;
//             const chunkSize = 64 * 1024; // 64KB
//             const val = new stream.Readable({
//                 read: function read() {
//                     // sets this._read under the hood
//                     // push data onto the read queue, passing null
//                     // will signal the end of the stream (EOF)
//                     while (start < end) {
//                         const finish =
//                             Math.min(start + chunkSize, end);
//                         this.push(storedBuffer.slice(start, finish));
//                         start += chunkSize;
//                     }
//                     if (start >= end) {
//                         this.push(null);
//                     }
//                 },
//             });
//             return callback(null, val);
//         });
//     },

// };

export default backend;

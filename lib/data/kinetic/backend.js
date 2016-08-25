import { errors, stringHash } from 'arsenal';
import crypto from 'crypto';
import fs from 'fs';
import config from '../../Config';
import kinetic from 'kineticlib';
import net from 'net';
import constants from '../../../constants';
import { Logger } from 'werelogs';

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
                const pdu = new kinetic.PutPDU(1, key, value.length);
                console.log('----------------PDU-------------');
                console.log(pdu);
                console.log('----------------VALUE-------------');
                console.log(value);
                callback(null, key);
            });
    }
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

//     delete: function delMem(key, reqUids, callback) {
//         process.nextTick(() => {
//             delete ds[key];
//             return callback(null);
//         });
//     },
// };

export default backend;

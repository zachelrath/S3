import async from 'async';
import crypto from 'crypto';
import config from '../../Config';
import kinetic from 'kineticlib';
import { Logger } from 'werelogs';
import util from 'util';
let sequence = 1;
const logger = new Logger('FileDataBackend', {
    logLevel: config.log.logLevel,
    dumpLevel: config.log.dumpLevel,
});

export const ds = [];

function putKinetic(socket, size, value, callback) {

    console.log('ENTER IN PUTKINETIC FUNCTION');
    const key = crypto.randomBytes(20);
    const pdu = new kinetic.PutPDU(sequence, key, value.length);
    ++sequence;

    socket.write(pdu.read(), () => {
        console.log('pdu.read() ------ wrote');
    });
    return socket.write(value, () => {
        console.log('VALUE ========= wrote')
        return kinetic.streamToPDU(socket, (err, pdu) => {
            console.log('Error from streamToPDU  : ', err);
            if (err) {
                console.log('ENTER IN PUTKINETIC FUNCTION3333');
                return callback(err);
            }
            if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                console.log('ENTER IN PUTKINETIC FUNCTION4444');
                return callback(pdu.getErrorMessage());
            }
            console.log('ENTER IN PUTKINETIC FUNCTION55555');
            console.log(key);
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

function areBuffersEqual(bufA, bufB) {
    var len = bufA.length;
    if (len !== bufB.length) {
        return false;
    }
    for (var i = 0; i < len; i++) {
        if (bufA.readUInt8(i) !== bufB.readUInt8(i)) {
            return false;
        }
    }
    return true;
}

const backend = {
    put: function x(request, size, keyContext, reqUids, callback, socket) {
        let value = new Buffer(0);
        request.on('data', data => value = Buffer.concat([value, data]))
            .on('end', () => {
                console.log('size');
                console.log(size);
                console.log('value.length');
                console.log(value.length);

                // if (size < 1048576 || value.length < 1048576) {
                putKinetic(socket, value.length, value, callback);
                // } else {
                //     const keysArray = [];
                //     const valueTab = splitBuffer(value, size, 1000000);
                //     console.log(valueTab);
                //     async.mapLimit(valueTab, 5, (value, cb) => {
                //         console.log('ENTER IN FIRST CALLBACK');
                //         console.log(value);
                //         putKinetic(socket, value[0], value[1], (err, key) => {
                //             if (err) {
                //                 return cb(err);
                //             }
                //             console.log('asd');
                //             console.log(keysArray);
                //             keysArray.push(key);
                //             return cb(null, keysArray);
                //         });
                //     }, (err, result) => {
                //         console.log('LAST CALLBACK');
                //         console.log(err);
                //         console.log(result);
                //         callback(null, result);
                //     });
                // }
            });
    },

    get: function y(key, range, reqUids, callback, socket) {
        let value = new Buffer(0);
        console.log(key);
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
            console.log(util.inspect(
                pdu, { showHidden: false, depth: null }));
            socket.resume();
            socket.on('data', chunk => {
                value = Buffer.concat([value, chunk]);
                // if (value.length === pdu.getChunkSize()){
                // }
            });
            return socket.on('end', () => callback(null, value));
        });
    },

    delete: function z(key, reqUids, callback, socket) {
        console.log('key in delete = = = = = = =');
        console.log(key);
        console.log('key in delete with treansformation = = = = = = =');
        console.log(new Buffer(key.data));
        if (!Buffer.isBuffer(key)){
            key = new Buffer(key.data);
        }
        const pdu = new kinetic.DeletePDU(sequence, key);
        ++sequence;
        socket.write(pdu.read());

        kinetic.streamToPDU(socket, (err, pdu) => {
            if (err) {
                return callback(err);
            }
            console.log(util.inspect(
                pdu, { showHidden: false, depth: null }));
            if (pdu.getStatusCode() !== kinetic.errors.SUCCESS) {
                return callback(kinetic.getErrorName(pdu.getStatusCode()));
            }
            return callback(null);
        });
    },
};

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

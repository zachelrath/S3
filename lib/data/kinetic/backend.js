import stream from 'stream';

import async from 'async';
import { splitSync } from 'node-split';

import config from '../../Config';

const OBJECT_MAX_SZ = 1048576;

function doPut(kinetic, index, value, valueLen, callback) {
    return kinetic.put(index, Buffer.concat(value, valueLen),
                       { force: true, synchronization: 'WRITETHROUGH' },
                       callback);
}

function splitAndPut(kinetic, index, value, valueLen, callback) {
    var splitted = splitSync(Buffer.concat(value, valueLen), {
        bytes: '1M',
    });
    const keysArray = [];
    async.eachSeries(splitted, (item, next) => {
        kinetic.put(index, item,
                    { force: true, synchronization: 'WRITETHROUGH' },
                    (err, key) => {
                        keysArray.push(key);
                        keysArray.push(Buffer.from('/')),
                        next();
                    });
    }, err => {
        kinetic.put(index, Buffer.concat(keysArray),
                    { force: true, synchronization: 'WRITETHROUGH' },
                    (err, key) => {
                        return callback(err, Buffer.concat([Buffer.from('|'), key]));
                    });
    });
}


function doGet(kinetic, index, key, range, callback) {
    return kinetic.get(index, key, range, callback);
}

function getAndSend(kinetic, index, key, range, callback) {
    console.log('------------------');
    console.log(key)
    console.log('------------------');
    console.log(key)
    console.log('------------------');
    console.log(key)
    console.log('------------------');
    console.log(key)
    console.log('------------------');
    console.log(key)
    console.log('------------------');
    console.log(key);
    kinetic.get(index, key.slice(1), undefined, (err, data) => {
        const keys = data.read();
        console.log(range);
        console.log(keys);
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        console.log('------------------');
        const keysArray = keys.toString().split('/');
        const dataArray = [];
        keysArray.splice(keysArray.length - 1, 1);
        console.log(keysArray);
        async.eachSeries(keysArray, (item, next) => {
            doGet(kinetic, index, item, undefined, (err, data) => {
                dataArray.push(data.read());
                next();
            });
        }, err => {
            // let endValue;
            // const chunk = Buffer.concat(dataArray);
            // if (range) {
            //     endValue = chunk.slice(range[0], range[1] + 1);
            // } else {
            //     endValue = chunk;
            // }
            return callback(err, new stream.Readable({
                read() {
                    this.push(Buffer.concat(dataArray));
                    this.push(null);
                },
            }));
        });
    });
}

function doDelete(kinetic, index, key, callback) {
    return kinetic.delete(
        index, key, { force: true, synchronization: 'WRITETHROUGH' }, callback);
}

function deleteAllParts(kinetic, index, key, callback) {
    kinetic.get(index, key.slice(1), undefined, (err, data) => {
        const keys = data.read();
        const keysArray = keys.toString().split('/');
        console.log(keysArray);
        keysArray.splice(keysArray.length - 1, 1);
        async.eachSeries(keysArray, (item, next) => {
            doDelete(kinetic, index, item, (err) => {
                if (err) {
                    return callback(err);
                }
                next();
            });
        }, err => {
            return callback();
        });
    });

}

const backend = {
    put: function putK(request, size, keyContext, reqUids, callback, drive) {
        const value = [];
        let valueLen = 0;
        const kinetic = config.kinetic.instance;
        request.on('data', data => {
            value.push(data);
            valueLen += data.length;
        }).on('end', err => {
            const index = kinetic.getSocketIndex(
                drive || config.kinetic.hosts[0]);
            console.log('-----------------index-------------')
            console.log('-----------------index-------------')
            console.log('-----------------index-------------')
            console.log('-----------------index-------------')
            console.log(index);
            if (err) {
                return callback(err);
            }
            if (valueLen <= OBJECT_MAX_SZ) {
                return doPut(kinetic, index, value, valueLen, callback);
            }
            return splitAndPut(kinetic, index, value, valueLen, callback);
        });
    },

    get: function getK(key, range, reqUids, callback, drive) {
        const kinetic = config.kinetic.instance;
        const keyBuffer = Buffer.from(key);
        const index = kinetic.getSocketIndex(
            drive || config.kinetic.hosts[0]);
        if (keyBuffer.toString().startsWith('|')) {
            return getAndSend(kinetic, index, keyBuffer, range, callback);
        }
        return doGet(kinetic, index, keyBuffer, range, callback);
    },

    delete: function delK(key, reqUids, callback, drive) {
        const kinetic = config.kinetic.instance;
        const index = kinetic.getSocketIndex(
            drive || config.kinetic.hosts[0]);
        const keyBuffer = Buffer.from(key);
        if (keyBuffer.toString().startsWith('|')) {
            return deleteAllParts(kinetic, index, keyBuffer, callback);
        }
        return deleteAllParts(kinetic, index, keyBuffer, callback);
    },

    healthcheck: (log, callback) => {
        process.nextTick(
            () => callback(null, { statusCode: 200, statusMessage: 'OK' }));
    },
};

export default backend;

import BucketClientInterface from './bucketclient/backend';
import BucketFileInterface from './bucketfile/backend';
import BucketInfo from './BucketInfo';
import inMemory from './in_memory/backend';
import config from '../Config';

let client;
let implName;

if (config.backends.metadata === 'mem') {
    client = inMemory;
    implName = 'memorybucket';
} else if (config.backends.metadata === 'file') {
    client = new BucketFileInterface();
    implName = 'bucketfile';
} else if (config.backends.metadata === 'scality') {
    client = new BucketClientInterface();
    implName = 'bucketclient';
}

function intersection(x, y) {
    return x.filter(function(elem) {
        return y.indexOf(elem) != -1;
	});
}

function difference(x, y) {
    return x.filter(function(elem) {
        return y.indexOf(elem) === -1;
	});
}

function union (x, y) {
    const res = x.concat(y);
    return res.filter(function(elem, pos) {
        return res.indexOf(elem) == pos
    });
}

function constructResponse(res, keys, bucketName, prefix, marker, delimiter, maxKeys, log, cb) {
    const params = { bucketName, prefix, marker, maxKeys, delimiter, log, cb};
    client.listObject(bucketName, { prefix:keys[0], marker, maxKeys, delimiter },
        log, (err, data) => {
            if (err) {
                log.warn('error from metadata', { implName, err });
                return cb(err);
            }
            keys.splice(0, 1);
            if (keys.length === 0) {
                res.forEach(elem =>{
                    data.Contents.push(elem);
                });
                return cb(err, data)
            }
            else {
                res.push(data.Contents[0]);
                return constructResponse(res, keys, params.bucketName, params.prefix, params.marker, params.delimiter, params.maxKeys, log, cb);
            }
        });
}

function getObjects(array, index, bucketName, prefix, marker, maxKeys, delimiter, log, cb) {
    const params = {bucketName, prefix, marker, maxKeys, delimiter, log, cb}
    prefix = array[index];
    if (array[index] === "T|x-amz-meta-op/NOT")
        prefix = null;
    client.listObject(bucketName, { prefix, marker, maxKeys, delimiter },
        log, (err, data) => {
            if (err) {
                log.warn('error from metadata', { implName, err });
                return paramms.cb(err);
            }
            if (array[index] != "T|x-amz-meta-op/NOT") {
                const keys = [];
                data.Contents.forEach(elem => {
                    keys.push(elem.key.split("/")[2]);
                });
                array[index] = keys;
                traverseTree(array, index-1, params.bucketName, params.prefix, params.marker, params.maxKeys, params.delimiter, params.log, params.cb);
            }
            else {
                data.Contents = data.Contents.filter(function(elem) {
                    return elem.key.indexOf("T|") === -1;
                });
                const univ = [];
                data.Contents.forEach(elem => {
                    univ.push(elem.key)
                });
                array[index] = difference(univ, array[index+1]);
                traverseTree(array, index-1, params.bucketName, params.prefix, params.marker, params.maxKeys, params.delimiter, params.log, params.cb);
            }
        });
}

function traverseTree (array, index, bucketName, prefix, marker, maxKeys, delimiter, log, cb) {
    if (index === -1)
        return constructResponse([], array[0], bucketName, prefix, marker, delimiter, maxKeys, log, cb);
    if (array[index] === "T|x-amz-meta-op/AND") {
        array[index] = intersection(array[index+1], array[index+2]);
        traverseTree(array, index-1, bucketName, prefix, marker, maxKeys, delimiter, log, cb);
    }
    else if (array[index] === "T|x-amz-meta-op/OR") {
        array[index] = union(array[index+1], array[index+2]);
        traverseTree(array, index-1, bucketName, prefix, marker, maxKeys, delimiter, log, cb);
    }
    else
        getObjects(array, index, bucketName, prefix, marker, maxKeys, delimiter, log, cb)
}

const metadata = {
    createBucket: (bucketName, bucketMD, log, cb) => {
        log.debug('creating bucket in metadata');
        client.createBucket(bucketName, bucketMD, log, err => {
            if (err) {
                log.warn('error from metadata', { implName, error: err });
                return cb(err);
            }
            log.trace('bucket created in metadata');
            return cb(err);
        });
    },

    updateBucket: (bucketName, bucketMD, log, cb) => {
        log.debug('updating bucket in metadata');
        client.putBucketAttributes(bucketName, bucketMD, log, err => {
            if (err) {
                log.warn('error from metadata', { implName, error: err });
                return cb(err);
            }
            log.trace('bucket updated in metadata');
            return cb(err);
        });
    },

    getBucket: (bucketName, log, cb) => {
        log.debug('getting bucket from metadata');
        client.getBucketAttributes(bucketName, log, (err, data) => {
            if (err) {
                log.warn('error from metadata', { implName, error: err });
                return cb(err);
            }
            log.trace('bucket retrieved from metadata');
            return cb(err, BucketInfo.fromObj(data));
        });
    },

    deleteBucket: (bucketName, log, cb) => {
        log.debug('deleting bucket from metadata');
        client.deleteBucket(bucketName, log, err => {
            if (err) {
                log.warn('error from metadata', { implName, error: err });
                return cb(err);
            }
            log.debug('Deleted bucket from Metadata');
            return cb(err);
        });
    },

    putObjectMD: (bucketName, objName, objVal, log, cb) => {
        log.debug('putting object in metdata');
        const tagkey = [];
        for (var val in objVal){
          if (val.indexOf("x-amz-meta") != -1 && val != "x-amz-meta-s3cmd-attrs") {
              const meta = objVal[val].split("/")
                tagkey.push("T|"+val+"/"+objVal[val]+"/"+objName);
            }
        };
        client.putObject(bucketName, objName, objVal, log, err => {
            if (err) {
                log.warn('error from metadata', { implName, error: err });
                return cb(err);
            }
            for (var key in tagkey) {
                client.putObject(bucketName, tagkey[key], "", log, err => {
                    if (err) {
                        log.warn('error from metadata', { implName, error: err });
                        return cb(err);
                    }
                });
            }
            log.debug('object successfully put in metadata');
            return cb(err);
        });
    },

    getBucketAndObjectMD: (bucketName, objName, log, cb) => {
        log.debug('getting bucket and object from metadata',
                  { database: bucketName, object: objName });
        client.getBucketAndObject(bucketName, objName, log, (err, data) => {
            if (err) {
                log.debug('error from metadata', { implName, err });
                return cb(err);
            }
            log.debug('bucket and object retrieved from metadata',
                      { database: bucketName, object: objName });
            return cb(err, data);
        });
    },

    getObjectMD: (bucketName, objName, log, cb) => {
        log.debug('getting object from metadata');
        client.getObject(bucketName, objName, log, (err, data) => {
            if (err) {
                log.warn('error from metadata', { implName, err });
                return cb(err);
            }
            log.debug('object retrieved from metadata');
            return cb(err, data);
        });
    },

    deleteObjectMD: (bucketName, objName, log, cb) => {
        log.debug('deleting object from metadata');
        client.deleteObject(bucketName, objName, log, err => {
            if (err) {
                log.warn('error from metadata', { implName, err });
                return cb(err);
            }
            log.debug('object deleted from metadata');
            return cb(err);
        });
    },

    listObject: (bucketName, prefix, marker, delimiter, maxKeys, log, cb) => {
        const localPrefix = prefix;
        prefix = null;
        if (typeof localPrefix === "object")
            return traverseTree(localPrefix, localPrefix.length-1, bucketName, prefix, marker, maxKeys, delimiter, log, cb);
        client.listObject(bucketName, { prefix, marker, maxKeys, delimiter },
            log, (err, data) => {
                if (err) {
                    log.warn('error from metadata', { implName, err });
                    return cb(err);
                }
                log.debug('object listing retrieved from metadata');
                data.CommonPrefixes = data.CommonPrefixes.filter(function(elem) {
                    return elem.indexOf("T|") === -1;
                });
                data.Contents = data.Contents.filter(function(elem) {
                    return elem.key.indexOf("T|") === -1;
                });
                return cb(null, data)
        });
    },

    listMultipartUploads: (bucketName, listingParams, log, cb) => {
        client.listMultipartUploads(bucketName, listingParams, log,
            (err, data) => {
                log.debug('getting mpu listing from metadata');
                if (err) {
                    log.warn('error from metadata', { implName, err });
                    return cb(err);
                }
                log.debug('mpu listing retrieved from metadata');
                return cb(err, data);
            });
    },

    switch: (newClient) => {
        client = newClient;
    },
};

export default metadata;

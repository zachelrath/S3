import { UtapiClient } from 'utapi';
import _config from '../Config';
// setup utapi client
const utapi = new UtapiClient(_config.utapi);
const metrics = {
    bucketPut: 'createBucket',
    bucketDelete: 'deleteBucket',
    bucketGet: 'listBucket',
    bucketGetACL: 'getBucketAcl',
    bucketPutACL: 'putBucketAcl',
    objectPutPart: 'uploadPart',
    listParts: 'listMultipartUploadParts',
    multipartDelete: 'abortMultipartUpload',
    objectDelete: 'deleteObject',
    objectGet: 'getObject',
    objectGetACL: 'getObjectAcl',
    objectPut: 'putObject',
    objectCopy: 'copyObject',
    objectPutACL: 'putObjectAcl',
    bucketHead: 'headBucket',
    objectHead: 'headObject',
};

/**
* catch all method where various stats/metrics can be plugged in
* @param {object} err - Arsenal error object
* @param {object} log - Werelogs request logger
* @param {string} action - api action name
* @param {string} bucket - bucket name
* @param {number} newByteLength - content length in bytes of the new data
* @param {number} oldByteLength - content length in bytes of the old data
* @param {number} objectsCount - number of objects added or removed
* @return {undefined}
*/
export default function pushMetrics(err, log, action, bucket,
    newByteLength, oldByteLength, objectsCount) {
    if (err) {
        return undefined;
    }
    // Some Utapi metric names differ from S3 API names.
    const metric = action in metrics ? metrics[action] : action;
    return utapi.pushMetric(metric, log.getSerializedUids(), {
        bucket,
        newByteLength,
        oldByteLength,
        objectsCount,
    });
}

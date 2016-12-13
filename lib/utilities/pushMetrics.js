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
 * Pass the corresponding metric action and the expected params to Utapi.
 * @param {object} err - Arsenal error object
 * @param {object} log - Werelogs request logger
 * @param {string} action - api action name
 * @param {string} metricData - metrics data object
 * @return {function} the Utapi `pushMetric` method with the correct parameters
 */
export default function pushMetrics(err, log, action, metricData) {
    if (err) {
        return undefined;
    }
    // Reconstruct object so sll properties are properly defined for Utapi.
    const { bucket, newByteLength, oldByteLength, objectsCount } = metricData;
    const params = {
        bucket,
        newByteLength,
        oldByteLength,
        objectsCount,
    };
    // Some Utapi metric names differ from S3 API names.
    const metric = action in metrics ? metrics[action] : action;
    return utapi.pushMetric(metric, log.getSerializedUids(), params);
}

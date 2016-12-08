import { UtapiClient } from 'utapi';
import _config from '../Config';
// setup utapi client
const utapi = new UtapiClient(_config.utapi);

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
    return utapi.pushMetric(action, log.getSerializedUids(), {
        bucket,
        newByteLength,
        oldByteLength,
        objectsCount,
    });
}

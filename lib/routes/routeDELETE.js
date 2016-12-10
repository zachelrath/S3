import api from '../api/api';
import routesUtils from './routesUtils';
import pushMetrics from '../utilities/pushMetrics';
import statsReport500 from '../utilities/statsReport500';

export default function routeDELETE(req, res, log, utapi,
    statsClient) {
    log.debug('routing request', { method: 'routeDELETE' });

    if (req.objectKey === undefined) {
        api.callApiMethod('bucketDelete', req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            pushMetrics(err, log, utapi, 'bucketDelete', req.bucketName);
            return routesUtils.responseNoBody(err, resHeaders, res, 204,
                log);
        });
    } else {
        if (req.query.uploadId) {
            api.callApiMethod('multipartDelete', req, res, log,
                (err, resHeaders) => {
                    statsReport500(err, statsClient);
                    pushMetrics(err, log, utapi, 'multipartDelete',
                        req.bucketName);
                    return routesUtils.responseNoBody(err, resHeaders, res,
                        204, log);
                });
        } else {
            api.callApiMethod('objectDelete', req, res, log,
              (err, contentLength) => {
                  /*
                  * Since AWS expects a 204 regardless of the existence of the
                  * object, the error NoSuchKey should not be sent back as a
                  * response.
                  */
                  if (err && !err.NoSuchKey) {
                      return routesUtils.responseNoBody(err, null,
                        res, null, log);
                  }
                  statsReport500(err, statsClient);
                  pushMetrics(err, log, utapi, 'objectDelete',
                    req.bucketName, contentLength);
                  return routesUtils.responseNoBody(null, null, res,
                    204, log);
              });
        }
    }
}

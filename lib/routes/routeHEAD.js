import api from '../api/api';
import { errors } from 'arsenal';
import routesUtils from './routesUtils';
import pushMetrics from '../utilities/pushMetrics';
import statsReport500 from '../utilities/statsReport500';

export default function routeHEAD(req, res, log, utapi, statsClient) {
    log.debug('routing request', { method: 'routeHEAD' });
    if (req.bucketName === undefined) {
        log.trace('head request without bucketName');
        routesUtils.responseXMLBody(errors.MethodNotAllowed,
            null, res, log);
    } else if (req.objectKey === undefined) {
        // HEAD bucket
        api.callApiMethod('bucketHead', req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            pushMetrics(err, log, utapi, 'bucketHead', req.bucketName);
            return routesUtils.responseNoBody(err, resHeaders, res, 200,
                log);
        });
    } else {
        // HEAD object
        api.callApiMethod('objectHead', req, res, log, (err, resHeaders) => {
            statsReport500(err, statsClient);
            pushMetrics(err, log, utapi, 'objectHead', req.bucketName);
            return routesUtils.responseContentHeaders(err, {}, resHeaders,
                                               res, log);
        });
    }
}

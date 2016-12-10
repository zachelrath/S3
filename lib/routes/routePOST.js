import { errors } from 'arsenal';

import api from '../api/api';
import routesUtils from './routesUtils';
import pushMetrics from '../utilities/pushMetrics';

/* eslint-disable no-param-reassign */
export default function routePOST(req, res, log, utapi) {
    log.debug('routing request', { method: 'routePOST' });
    req.post = '';

    req.on('data', chunk => {
        req.post += chunk.toString();
    });

    req.on('end', () => {
        if (req.query.uploads !== undefined) {
            // POST multipart upload
            api.callApiMethod('initiateMultipartUpload', req, res, log,
                (err, result) => {
                    pushMetrics(err, log, utapi, 'initiateMultipartUpload',
                        req.bucketName);
                    return routesUtils.responseXMLBody(err, result, res,
                        log);
                });
        } else if (req.query.uploadId !== undefined) {
            // POST complete multipart upload
            api.callApiMethod('completeMultipartUpload', req, res, log,
                (err, result) => {
                    pushMetrics(err, log, utapi, 'completeMultipartUpload',
                        req.bucketName);
                    return routesUtils.responseXMLBody(err, result, res,
                        log);
                });
        } else if (req.query.delete !== undefined) {
            // POST multiObjectDelete
            api.callApiMethod('multiObjectDelete', req, res, log,
                (err, xml, totalDeletedContentLength, numOfObjects) => {
                    pushMetrics(err, log, utapi, 'multiObjectDelete',
                        req.bucketName, totalDeletedContentLength,
                        numOfObjects);
                    return routesUtils.responseXMLBody(err, xml, res,
                        log);
                });
        } else {
            routesUtils.responseNoBody(errors.NotImplemented, null, res,
                200, log);
        }
        return undefined;
    });
}
/* eslint-enable no-param-reassign */

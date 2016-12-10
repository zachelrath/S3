import api from '../api/api';
import { errors } from 'arsenal';
import routesUtils from './routesUtils';
import pushMetrics from '../utilities/pushMetrics';
import statsReport500 from '../utilities/statsReport500';

export default function routerGET(req, res, log, utapi, statsClient) {
    log.debug('routing request', { method: 'routerGET' });
    if (req.bucketName === undefined && req.objectKey !== undefined) {
        routesUtils.responseXMLBody(errors.NoSuchBucket, null, res, log);
    } else if (req.bucketName === undefined
        && req.objectKey === undefined) {
        // GET service
        api.callApiMethod('serviceGet', req, res, log, (err, xml) => {
            statsReport500(err, statsClient);
            return routesUtils.responseXMLBody(err, xml, res, log);
        });
    } else if (req.objectKey === undefined) {
        // GET bucket ACL
        if (req.query.acl !== undefined) {
            api.callApiMethod('bucketGetACL', req, res, log, (err, xml) => {
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'bucketGetACL',
                    req.bucketName);
                return routesUtils.responseXMLBody(err, xml, res, log);
            });
        } else if (req.query.versioning !== undefined) {
            api.callApiMethod('bucketGetVersioning', req, res, log,
                (err, xml) => {
                    // TODO push metrics for gucketGetVersioning
                    // pushMetrics(err, log, utapi, 'bucketGetVersioning',
                    //     request.bucketName);
                    statsReport500(err, statsClient);
                    routesUtils.responseXMLBody(err, xml, res, log);
                });
        } else if (req.query.uploads !== undefined) {
            // List MultipartUploads
            api.callApiMethod('listMultipartUploads', req, res, log,
                (err, xml) => {
                    statsReport500(err, statsClient);
                    pushMetrics(err, log, utapi, 'listMultipartUploads',
                        req.bucketName);
                    return routesUtils.responseXMLBody(err, xml, res, log);
                });
        } else {
            // GET bucket
            api.callApiMethod('bucketGet', req, res, log, (err, xml) => {
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'bucketGet', req.bucketName);
                return routesUtils.responseXMLBody(err, xml, res, log);
            });
        }
    } else {
        if (req.query.acl !== undefined) {
            // GET object ACL
            api.callApiMethod('objectGetACL', req, res, log, (err, xml) => {
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'objectGetACL',
                    req.bucketName);
                return routesUtils.responseXMLBody(err, xml, res, log);
            });
            // List parts of an open multipart upload
        } else if (req.query.uploadId !== undefined) {
            api.callApiMethod('listParts', req, res, log, (err, xml) => {
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'listParts', req.bucketName);
                return routesUtils.responseXMLBody(err, xml, res, log);
            });
        } else {
            // GET object
            api.callApiMethod('objectGet', req, res, log, (err, dataGetInfo,
                    resMetaHeaders, range) => {
                let contentLength = 0;
                if (resMetaHeaders && resMetaHeaders['Content-Length']) {
                    contentLength = resMetaHeaders['Content-Length'];
                }
                log.end().addDefaultFields({ contentLength });
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'objectGet', req.bucketName,
                    contentLength);
                return routesUtils.responseStreamData(err, req.headers,
                    resMetaHeaders, dataGetInfo, res, range, log);
            });
        }
    }
}

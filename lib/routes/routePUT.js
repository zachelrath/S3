import { errors } from 'arsenal';
import { parseString } from 'xml2js';

import api from '../api/api';
import routesUtils from './routesUtils';
import utils from '../utils';
import pushMetrics from '../utilities/pushMetrics';
import statsReport500 from '../utilities/statsReport500';

const encryptionHeaders = [
    'x-amz-server-side-encryption',
    'x-amz-server-side-encryption-customer-algorithm',
    'x-amz-server-side-encryption-aws-kms-key-id',
    'x-amz-server-side-encryption-context',
    'x-amz-server-side-encryption-customer-key',
    'x-amz-server-side-encryption-customer-key-md5',
];

const validStatuses = ['Enabled', 'Suspended'];
const validMfaDeletes = [undefined, 'Enabled', 'Disabled'];

/* eslint-disable no-param-reassign */
export default function routePUT(req, res, log, utapi, statsClient) {
    log.debug('routing request', { method: 'routePUT' });

    if (req.objectKey === undefined || req.objectKey === '/') {
        // PUT bucket - PUT bucket ACL

        // content-length for object is handled separately below
        const contentLength = req.headers['content-length'];
        if (contentLength && (isNaN(contentLength) || contentLength === '' ||
        contentLength < 0)) {
            log.debug('invalid content-length header');
            return routesUtils.responseNoBody(
              errors.BadRequest, null, res, null, log);
        }
        req.post = '';
        req.on('data', chunk => {
            req.post += chunk.toString();
        });

        req.on('end', () => {
            // PUT bucket ACL
            if (req.query.acl !== undefined) {
                api.callApiMethod('bucketPutACL', req, res, log, err => {
                    statsReport500(err, statsClient);
                    pushMetrics(err, log, utapi, 'bucketPutACL',
                        req.bucketName);
                    return routesUtils.responseNoBody(err, null, res, 200,
                        log);
                });
            } else if (req.query.versioning !== undefined) {
                if (req.post === '') {
                    log.debug('request xml is missing');
                    return routesUtils.responseNoBody(
                        errors.MalformedXML, null, res, null, log);
                }
                const xmlToParse = req.post;
                return parseString(xmlToParse, (err, result) => {
                    if (err) {
                        log.debug('request xml is malformed');
                        return routesUtils.responseNoBody(
                            errors.MalformedXML, null, res, null, log);
                    }
                    const status = result.VersioningConfiguration.Status ?
                        result.VersioningConfiguration.Status[0] : undefined;
                    const mfaDelete = result.VersioningConfiguration.MfaDelete ?
                        result.VersioningConfiguration.MfaDelete[0] : undefined;
                    if (validStatuses.indexOf(status) < 0 ||
                        validMfaDeletes.indexOf(mfaDelete) < 0) {
                        log.debug('illegal versioning configuration');
                        return routesUtils.responseNoBody(
                            errors.IllegalVersioningConfigurationException,
                            null, res, null, log);
                    }
                    if (mfaDelete) {
                        log.debug('mfa deletion is not implemented');
                        return routesUtils.responseNoBody(
                            errors.NotImplemented.customizedDescription(
                                'MFA Deletion is not supported yet.'), null,
                            res, null, log);
                    }
                    return api.callApiMethod('bucketPutVersioning', req, res,
                        log, err => {
                            // TODO push metrics for bucketPutVersioning
                            // pushMetrics(err, log, utapi,
                            //         'bucketPutVersioning',
                            //         request.bucketName);
                            statsReport500(err, statsClient);
                            routesUtils.responseNoBody(
                                err, null, res, 200, log);
                        });
                });
            } else if (req.query.acl === undefined) {
                // PUT bucket
                if (req.post) {
                    const xmlToParse = req.post;
                    return parseString(xmlToParse, (err, result) => {
                        if (err || !result.CreateBucketConfiguration
                            || !result.CreateBucketConfiguration
                                .LocationConstraint
                            || !result.CreateBucketConfiguration
                                .LocationConstraint[0]) {
                            log.debug('request xml is malformed');
                            return routesUtils.responseNoBody(errors
                                .MalformedXML,
                                null, res, null, log);
                        }
                        const locationConstraint =
                            result.CreateBucketConfiguration
                            .LocationConstraint[0];
                        log.trace('location constraint',
                            { locationConstraint });
                        return api.callApiMethod('bucketPut', req, res, log,
                        err => {
                            statsReport500(err, statsClient);
                            pushMetrics(err, log, utapi, 'bucketPut',
                                req.bucketName);
                            return routesUtils.responseNoBody(err, null,
                              res, 200, log);
                        }, locationConstraint);
                    });
                }
                return api.callApiMethod('bucketPut', req, res, log, err => {
                    statsReport500(err, statsClient);
                    pushMetrics(err, log, utapi, 'bucketPut',
                        req.bucketName);
                    return routesUtils.responseNoBody(err, null, res, 200,
                        log);
                });
            }
            return undefined;
        });
    } else {
        // PUT object, PUT object ACL, PUT object multipart or
        // PUT object copy
        // if content-md5 is not present in the headers, try to
        // parse content-md5 from meta headers

        if (req.headers['content-md5'] === '') {
            log.debug('empty content-md5 header', {
                method: 'routePUT',
            });
            return routesUtils
            .responseNoBody(errors.InvalidDigest, null, res, 200, log);
        }
        if (req.headers['content-md5']) {
            req.contentMD5 = req.headers['content-md5'];
        } else {
            req.contentMD5 = utils.parseContentMD5(req.headers);
        }
        if (req.contentMD5 && req.contentMD5.length !== 32) {
            req.contentMD5 = Buffer.from(req.contentMD5, 'base64')
                .toString('hex');
            if (req.contentMD5 && req.contentMD5.length !== 32) {
                log.warn('invalid md5 digest', {
                    contentMD5: req.contentMD5,
                });
                return routesUtils
                    .responseNoBody(errors.InvalidDigest, null, res, 200,
                                    log);
            }
        }
        // object level encryption
        if (encryptionHeaders.some(i => req.headers[i] !== undefined)) {
            return routesUtils.responseXMLBody(errors.NotImplemented, null,
                res, log);
        }
        if (req.query.partNumber) {
            if (req.headers['x-amz-copy-source']) {
                api.callApiMethod('objectPutCopyPart', req, res, log,
                (err, xml, additionalHeaders) => {
                    statsReport500(err, statsClient);
                    return routesUtils.responseXMLBody(err, xml, res, log,
                            additionalHeaders);
                });
            } else {
                api.callApiMethod('objectPutPart', req, res, log,
                    (err, calculatedHash) => {
                        // ETag's hex should always be enclosed in quotes
                        const resMetaHeaders = { ETag: `"${calculatedHash}"` };
                        statsReport500(err, statsClient);
                        pushMetrics(err, log, utapi, 'objectPutPart',
                            req.bucketName, req.parsedContentLength);
                        routesUtils.responseNoBody(err, resMetaHeaders,
                            res, 200, log);
                    });
            }
        } else if (req.query.acl !== undefined) {
            req.post = '';
            req.on('data', chunk => {
                req.post += chunk.toString();
            });
            req.on('end', () => {
                api.callApiMethod('objectPutACL', req, res, log, err => {
                    statsReport500(err, statsClient);
                    pushMetrics(err, log, utapi, 'objectPutACL',
                        req.bucketName);
                    return routesUtils.responseNoBody(err, null, res, 200,
                        log);
                });
            });
        } else if (req.headers['x-amz-copy-source']) {
            return api.callApiMethod('objectCopy', req, res, log, (err, xml,
                additionalHeaders, sourceObjSize, destObjPrevSize) => {
                statsReport500(err, statsClient);
                pushMetrics(err, log, utapi, 'objectCopy', req.bucketName,
                    sourceObjSize, destObjPrevSize);
                routesUtils.responseXMLBody(err, xml, res, log,
                    additionalHeaders);
            });
        } else {
            if (req.headers['content-length'] === undefined &&
            req.headers['x-amz-decoded-content-length'] === undefined) {
                return routesUtils.responseNoBody(errors.MissingContentLength,
                    null, res, 411, log);
            }
            if (Number.isNaN(req.parsedContentLength) ||
            req.parsedContentLength < 0) {
                return routesUtils.responseNoBody(errors.BadRequest,
                    null, res, 400, log);
            }
            log.end().addDefaultFields({
                contentLength: req.parsedContentLength,
            });

            api.callApiMethod('objectPut', req, res, log,
                (err, contentMD5, prevContentLen) => {
                    // ETag's hex should always be enclosed in quotes
                    statsReport500(err, statsClient);
                    const resMetaHeaders = {
                        ETag: `"${contentMD5}"`,
                    };
                    pushMetrics(err, log, utapi, 'objectPut',
                        req.bucketName, req.parsedContentLength,
                        prevContentLen);
                    return routesUtils.responseNoBody(err, resMetaHeaders,
                        res, 200, log);
                });
        }
    }
    return undefined;
}
/* eslint-enable no-param-reassign */

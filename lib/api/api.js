import querystring from 'querystring';

import { auth, errors } from 'arsenal';

import bucketDelete from './bucketDelete';
import bucketGet from './bucketGet';
import bucketGetACL from './bucketGetACL';
import bucketGetVersioning from './bucketGetVersioning';
import bucketHead from './bucketHead';
import bucketPut from './bucketPut';
import bucketPutACL from './bucketPutACL';
import bucketPutVersioning from './bucketPutVersioning';
import completeMultipartUpload from './completeMultipartUpload';
import initiateMultipartUpload from './initiateMultipartUpload';
import listMultipartUploads from './listMultipartUploads';
import listParts from './listParts';
import multiObjectDelete from './multiObjectDelete';
import multipartDelete from './multipartDelete';
import objectCopy from './objectCopy';
import objectDelete from './objectDelete';
import objectGet from './objectGet';
import objectGetACL from './objectGetACL';
import objectHead from './objectHead';
import objectPut from './objectPut';
import objectPutACL from './objectPutACL';
import objectPutPart from './objectPutPart';
import objectPutCopyPart from './objectPutCopyPart';
import prepareRequestContexts from
    './apiUtils/authorization/prepareRequestContexts';
import serviceGet from './serviceGet';
import vault from '../auth/vault';

auth.setHandler(vault);

const api = {
    callApiMethod(apiMethod, req, res, log, callback, locationConstraint) {
        let sourceBucket;
        let sourceObject;
        if (apiMethod === 'objectCopy' || apiMethod === 'objectPutCopyPart') {
            let source =
                querystring.unescape(req.headers['x-amz-copy-source']);
            // If client sends the source bucket/object with a leading /,
            // remove it
            if (source[0] === '/') {
                source = source.slice(1);
            }
            const slashSeparator = source.indexOf('/');
            if (slashSeparator === -1) {
                return callback(errors.InvalidArgument);
            }
            // Pull the source bucket and source object separated by /
            sourceBucket = source.slice(0, slashSeparator);
            sourceObject = source.slice(slashSeparator + 1);
        }
        const requestContexts = prepareRequestContexts(apiMethod,
            req, locationConstraint, sourceBucket, sourceObject);
        // if auth v4 emit check continue as we need the req body
        const authHeader = req.headers.authorization;
        if (req.headers.expect === '100-continue' && authHeader
            && authHeader.startsWith('AWS4')) {
            res.writeContinue();
        }
        return auth.server.doAuth(req, log, (err, userInfo,
            authorizationResults, streamingV4Params) => {
            if (err) {
                log.trace('authentication error', { error: err });
                return callback(err);
            }
            if (authorizationResults) {
                for (let i = 0; i < authorizationResults.length; i++) {
                    if (!authorizationResults[i].isAllowed) {
                        log.trace('authorization denial from Vault');
                        return callback(errors.AccessDenied);
                    }
                }
            }
            // auth success, emit check continue for auth v2 & query auth
            if (req.headers.expect === '100-continue') {
                if (!authHeader
                    || (authHeader && authHeader.startsWith('AWS '))) {
                    res.writeContinue();
                }
            }
            if (apiMethod === 'bucketPut') {
                return bucketPut(userInfo, req, locationConstraint,
                    log, callback);
            }
            if (apiMethod === 'objectCopy' ||
                apiMethod === 'objectPutCopyPart') {
                return this[apiMethod](userInfo, req, sourceBucket,
                    sourceObject, log, callback);
            }
            if (apiMethod === 'objectPut' || apiMethod === 'objectPutPart') {
                return this[apiMethod](userInfo, req, streamingV4Params,
                    log, callback);
            }
            return this[apiMethod](userInfo, req, log, callback);
        }, 's3', requestContexts);
    },
    bucketDelete,
    bucketGet,
    bucketGetACL,
    bucketGetVersioning,
    bucketHead,
    bucketPut,
    bucketPutACL,
    bucketPutVersioning,
    completeMultipartUpload,
    initiateMultipartUpload,
    listMultipartUploads,
    listParts,
    multiObjectDelete,
    multipartDelete,
    objectDelete,
    objectGet,
    objectGetACL,
    objectCopy,
    objectHead,
    objectPut,
    objectPutACL,
    objectPutPart,
    objectPutCopyPart,
    serviceGet,
};

export default api;

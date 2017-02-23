import querystring from 'querystring';

import { auth, errors } from 'arsenal';

import bucketDelete from './bucketDelete';
import bucketDeleteCors from './bucketDeleteCors';
import bucketDeleteWebsite from './bucketDeleteWebsite';
import bucketGet from './bucketGet';
import bucketGetACL from './bucketGetACL';
import bucketGetCors from './bucketGetCors';
import bucketGetVersioning from './bucketGetVersioning';
import bucketGetWebsite from './bucketGetWebsite';
import bucketHead from './bucketHead';
import bucketPut from './bucketPut';
import bucketPutACL from './bucketPutACL';
import bucketPutCors from './bucketPutCors';
import bucketPutVersioning from './bucketPutVersioning';
import bucketPutWebsite from './bucketPutWebsite';
import corsPreflight from './corsPreflight';
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
import websiteGet from './websiteGet';
import websiteHead from './websiteHead';

auth.setHandler(vault);

const api = {
    callApiMethod(apiMethod, request, log, callback, locationConstraint) {
        // no need to check auth on website or cors preflight requests
        if (apiMethod === 'websiteGet' || apiMethod === 'websiteHead' ||
        apiMethod === 'corsPreflight') {
            return this[apiMethod](request, log, callback);
        }
        let sourceBucket;
        let sourceObject;
        if (apiMethod === 'objectCopy' || apiMethod === 'objectPutCopyPart') {
            let source =
                querystring.unescape(request.headers['x-amz-copy-source']);
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
            request, locationConstraint, sourceBucket, sourceObject);
        return auth.server.doAuth(request, log, (err, userInfo,
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
            if (apiMethod === 'bucketPut') {
                return bucketPut(userInfo, request, locationConstraint,
                    log, callback);
            }
            if (apiMethod === 'objectCopy' ||
                apiMethod === 'objectPutCopyPart') {
                return this[apiMethod](userInfo, request, sourceBucket,
                    sourceObject, log, callback);
            }
            if (apiMethod === 'objectPut' || apiMethod === 'objectPutPart') {
                return this[apiMethod](userInfo, request, streamingV4Params,
                    log, callback);
            }
            return this[apiMethod](userInfo, request, log, callback);
        }, 's3', requestContexts);
    },
    bucketDelete,
    bucketDeleteCors,
    bucketDeleteWebsite,
    bucketGet,
    bucketGetACL,
    bucketGetCors,
    bucketGetVersioning,
    bucketGetWebsite,
    bucketHead,
    bucketPut,
    bucketPutACL,
    bucketPutCors,
    bucketPutVersioning,
    bucketPutWebsite,
    corsPreflight,
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
    websiteGet,
    websiteHead,
};

export default api;

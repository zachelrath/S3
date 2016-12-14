import crypto from 'crypto';

import async from 'async';
import { errors } from 'arsenal';

import bucketShield from './apiUtils/bucket/bucketShield';
import { isBucketAuthorized } from './apiUtils/authorization/aclChecks';
import metadata from '../metadata/wrapper';
import { parseCorsXml } from './apiUtils/bucket/bucketCors';

const requestType = 'bucketOwnerAction';

// NEED TO DO parseCorsXml
// NEED TO UPDATE BUCKETINFO
// NEED TO TEST

/**
 * Bucket Put Cors - Adds cors rules to bucket
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with requester's info
 * @param {object} request - http request object
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback to server
 * @return {undefined}
 */
export default function bucketPutCors(authInfo, request, log, callback) {
    log.debug('processing request', { method: 'bucketPutCors' });
    const bucketName = request.bucketName;
    const canonicalID = authInfo.getCanonicalID();

    if (!request.post) {
        return callback(errors.MissingRequestBodyError);
    }

    const md5 = crypto.createHash('md5')
        .update(request.post, 'utf8').digest('base64');
    if (md5 !== request.headers['content-md5']) {
        return callback(errors.BadDigest);
    }

    // WHAT IF SIZE BIGGER THAN AWS LIMIT??

    return async.waterfall([
        function parseXmlBody(next) {
            log.trace('parsing cors rules');
            return parseCorsXml(request.post, log, next);
        },
        function getBucketfromMetadata(rules, next) {
            metadata.getBucket(bucketName, log, (err, bucket) => {
                if (err) {
                    log.debug('metadata getbucket failed', { error: err });
                    return next(err);
                }
                if (bucketShield(bucket, requestType)) {
                    return next(errors.NoSuchBucket);
                }
                log.trace('found bucket in metadata');
                return next(null, bucket, rules);
            });
        },
        function validateBucketAuthorization(bucket, rules, next) {
            if (!isBucketAuthorized(bucket, requestType, canonicalID)) {
                log.debug('access denied for user on bucket', {
                    requestType,
                });
                return next(errors.AccessDenied);
            }
            return next(null, bucket, rules);
        },
        function updateBucketMetadata(bucket, rules, next) {
            log.trace('updating bucket cors rules in metadata');
            bucket.setCors(rules);
            metadata.updateBucket(bucketName, bucket, log, next);
        },
    ], err => {
        if (err) {
            log.trace('error processing request', { error: err,
                method: 'bucketPutCors' });
        }
        return callback(err);
    });
}

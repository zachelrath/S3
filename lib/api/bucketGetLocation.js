import { errors } from 'arsenal';

import bucketShield from './apiUtils/bucket/bucketShield';
import { isBucketAuthorized } from './apiUtils/authorization/aclChecks';
import metadata from '../metadata/wrapper';
import { pushMetric } from '../utapi/utilities';
import escapeForXML from '../utilities/escapeForXML';

const requestType = 'bucketOwnerAction';

/**
 * Bucket Get Location - Get bucket locationConstraint configuration
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with requester's info
 * @param {object} request - http request object
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback to server
 * @return {undefined}
 */

export default function bucketGetLocation(authInfo, request, log, callback) {
    const bucketName = request.bucketName;
    const canonicalID = authInfo.getCanonicalID();

    return metadata.getBucket(bucketName, log, (err, bucket) => {
        if (err) {
            log.debug('metadata getbucket failed', { error: err });
            return callback(err);
        }
        if (bucketShield(bucket, requestType)) {
            return callback(errors.NoSuchBucket);
        }
        log.trace('found bucket in metadata');

        if (!isBucketAuthorized(bucket, requestType, canonicalID)) {
            log.debug('access denied for account on bucket', {
                requestType,
                method: 'bucketGetLocation',
            });
            return callback(errors.AccessDenied);
        }

        let locationConstraint = bucket.getLocationConstraint();
        if (!locationConstraint || locationConstraint === 'us-east-1') {
          // AWS returns empty string if no region has been
          // provided or for us-east-1
          // Note: AWS JS SDK sends a request with locationConstraint us-east-1
          // if no locationConstraint provided.
            locationConstraint = '';
        }
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
            `${escapeForXML(locationConstraint)}</LocationConstraint>`;
        pushMetric('getBucketLocation', log, {
            authInfo,
            bucket: bucketName,
        });

        return callback(null, xml);
    });
}

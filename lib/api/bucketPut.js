import { errors } from 'arsenal';

import { createBucket } from './apiUtils/bucket/bucketCreation';
import config from '../Config';
import aclUtils from '../utilities/aclUtils';
import { pushMetric } from '../utapi/utilities';

// TODO: Change these locations with the config ones
const configLocationConstraints = {
    'aws-us-east-1': 'aws-us-east-1-value',
    'aws-us-east-test': 'aws-us-east-test-value',
    'scality-us-east-1': 'scality-us-east-1-value',
    'scality-us-west-1': 'scality-us-west-1-value',
    'virtual-user-metadata': 'virtual-user-metadata-value',
    'file': 'file-value',
    'mem': 'mem-value',
    '': 'defaultValue',
};

/*
   Format of xml request:

   <?xml version="1.0" encoding="UTF-8"?>
   <CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
   <LocationConstraint>us-west-1</LocationConstraint>
   </CreateBucketConfiguration>
   */

/**
 * PUT Service - Create bucket for the user
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with requester's info
 * @param {object} request - http request object
 * @param {string | undefined} locationConstraint - locationConstraint for
 * bucket (if any)
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback to server
 * @return {undefined}
 */
export default function bucketPut(authInfo, request, locationConstraint, log,
    callback) {
    let locationConstraintChecked;
    log.debug('processing request', { method: 'bucketPut' });

    if (authInfo.isRequesterPublicUser()) {
        log.debug('operation not available for public user');
        return callback(errors.AccessDenied);
    }
    if (!aclUtils.checkGrantHeaderValidity(request.headers)) {
        log.trace('invalid acl header');
        return callback(errors.InvalidArgument);
    }
    if (!locationConstraint || locationConstraint === 'us-east-1') {
        // AWS returns empty string if no region has been
        // provided or for us-east-1
        // Note: AWS JS SDK send a request with locationConstraint us-east-1
        // if no locationConstraint provided.
        locationConstraintChecked = '';
    } else {
        locationConstraintChecked = locationConstraint;
    }
    if (Object.keys(configLocationConstraints)
    .indexOf(locationConstraintChecked) < 0) {
        log.trace('locationConstraint is invalid',
          { locationConstraintChecked });
        return callback(errors.InvalidLocationConstraint);
    }
    const bucketName = request.bucketName;

    return createBucket(authInfo, bucketName, request.headers,
        locationConstraint, config.usEastBehavior, log, err => {
            if (err) {
                return callback(err);
            }
            pushMetric('createBucket', log, {
                authInfo,
                bucket: bucketName,
            });
            return callback();
        });
}

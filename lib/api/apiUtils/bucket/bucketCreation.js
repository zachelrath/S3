import async from 'async';
import assert from 'assert';
import { errors } from 'arsenal';

import acl from '../../../metadata/acl';
import BucketInfo from '../../../metadata/BucketInfo';
import constants from '../../../../constants';
import createKeyForUserBucket from './createKeyForUserBucket';
import metadata from '../../../metadata/wrapper';
import kms from '../../../kms/wrapper';
import isLegacyAWSBehavior from '../../../utilities/legacyAWSBehavior';

const usersBucket = constants.usersBucket;
const oldUsersBucket = constants.oldUsersBucket;
const userBucketOwner = 'admin';


function addToUsersBucket(canonicalID, bucketName, log, cb) {
    // BACKWARD: Simplify once do not have to deal with old
    // usersbucket name and old splitter

    // Get new format usersBucket to see if it exists
    return metadata.getBucket(usersBucket, log, (err, usersBucketAttrs) => {
        if (err && !err.NoSuchBucket && !err.BucketAlreadyExists) {
            return cb(err);
        }
        const splitter = usersBucketAttrs ?
            constants.splitter : constants.oldSplitter;
        let key = createKeyForUserBucket(canonicalID, splitter, bucketName);
        const omVal = { creationDate: new Date().toJSON() };
        // If the new format usersbucket does not exist, try to put the
        // key in the old usersBucket using the old splitter.
        // Otherwise put the key in the new format usersBucket
        const usersBucketBeingCalled = usersBucketAttrs ?
            usersBucket : oldUsersBucket;
        return metadata.putObjectMD(usersBucketBeingCalled, key,
            omVal, log, err => {
                if (err && err.NoSuchBucket) {
                    // There must be no usersBucket so createBucket
                    // one using the new format
                    log.trace('users bucket does not exist, ' +
                        'creating users bucket');
                    key = `${canonicalID}${constants.splitter}` +
                        `${bucketName}`;
                    const creationDate = new Date().toJSON();
                    const freshBucket = new BucketInfo(usersBucket,
                        userBucketOwner, userBucketOwner, creationDate,
                        BucketInfo.currentModelVersion());
                    return metadata.createBucket(usersBucket,
                        freshBucket, log, err => {
                            // Note: In the event that two
                            // users' requests try to create the
                            // usersBucket at the same time,
                            // this will prevent one of the users
                            // from getting a BucketAlreadyExists
                            // error with respect
                            // to the usersBucket.
                            if (err &&
                                err !==
                                    errors.BucketAlreadyExists) {
                                log.error('error from metadata', {
                                    error: err,
                                });
                                return cb(err);
                            }
                            log.trace('Users bucket created');
                            // Finally put the key in the new format
                            // usersBucket
                            return metadata.putObjectMD(usersBucket,
                                key, omVal, log, cb);
                        });
                }
                return cb(err);
            });
    });
}

function removeTransientOrDeletedLabel(bucket, log, callback) {
    log.trace('removing transient or deleted label from bucket attributes');
    const bucketName = bucket.getName();
    bucket.removeTransientFlag();
    bucket.removeDeletedFlag();
    return metadata.updateBucket(bucketName, bucket, log, callback);
}

function freshStartCreateBucket(bucket, canonicalID, log, callback) {
    const bucketName = bucket.getName();
    metadata.createBucket(bucketName, bucket, log, err => {
        if (err) {
            log.debug('error from metadata', { error: err });
            return callback(err);
        }
        log.trace('created bucket in metadata');
        return addToUsersBucket(canonicalID, bucketName, log, err => {
            if (err) {
                return callback(err);
            }
            return removeTransientOrDeletedLabel(bucket, log, callback);
        });
    });
}

/**
 * Finishes creating a bucket in transient state
 * by putting an object in users bucket representing the created bucket
 * and removing transient attribute of the created bucket
 * @param {object} bucketMD - either the bucket metadata sent in the new request
 * or the existing metadata if no new metadata sent
 * (for example in an objectPut)
 * @param {string} canonicalID - bucket owner's canonicalID
 * @param {object} log - Werelogs logger
 * @param {function} callback - callback with error or null as arguments
 * @return {undefined}
 */
export function cleanUpBucket(bucketMD, canonicalID, log, callback) {
    const bucketName = bucketMD.getName();
    return addToUsersBucket(canonicalID, bucketName, log, err => {
        if (err) {
            return callback(err);
        }
        return removeTransientOrDeletedLabel(bucketMD, log, callback);
    });
}

/**
 * Manage the server side encryption on bucket creation, as a side effect
 * a bucket key is created in the kms
 * @param {string} bucketName - name of bucket
 * @param {object} headers - request headers
 * @param {function} log - Werelogs logger
 * @param {function} cb - called on completion
 * @returns {undefined}
 * @callback called with (err, sseInfo: object)
 */
function bucketLevelServerSideEncryption(bucketName, headers, log, cb) {
    kms.bucketLevelEncryption(
        bucketName, headers, log, (err, sseInfo) => {
            if (err) {
                log.debug('error getting bucket encryption info', {
                    error: err,
                });
                return cb(err);
            }
            return cb(null, sseInfo);
        });
}

/**
 * Creates bucket
 * @param {AuthInfo} authInfo - Instance of AuthInfo class with
 *                              requester's info
 * @param {string} bucketName - name of bucket
 * @param {object} headers - request headers
 * @param {string} locationConstraint - locationConstraint provided in
 *                                      request body xml (if provided)
 * @param {boolean} usEastBehavior - whether s3 is set up with a usEastBehavior
 * config option
 * @param {function} log - Werelogs logger
 * @param {function} cb - callback to bucketPut
 * @return {undefined}
 */
export function createBucket(authInfo, bucketName, headers,
    locationConstraint, usEastBehavior, log, cb) {
    log.trace('Creating bucket');
    assert.strictEqual(typeof bucketName, 'string');
    const canonicalID = authInfo.getCanonicalID();
    const ownerDisplayName =
        authInfo.getAccountDisplayName();
    const creationDate = new Date().toJSON();
    const bucket = new BucketInfo(bucketName,
        canonicalID, ownerDisplayName, creationDate,
        BucketInfo.currentModelVersion());

    if (locationConstraint !== undefined) {
        bucket.setLocationConstraint(locationConstraint);
    } else if (usEastBehavior) {
      // If config was set with usEastBehavior and
      // no location was sent on bucketPut, we save
      // 'us-east-1' as the location of the bucket
      // since that is likely user intent (also AWS
      // defaults the location to the endpoint if you
      // do not specify a different location)
        bucket.setLocationConstraint('us-east-1');
    }
    const parseAclParams = {
        headers,
        resourceType: 'bucket',
        acl: bucket.acl,
        log,
    };
    async.parallel({
        prepareNewBucketMD: function prepareNewBucketMD(callback) {
            acl.parseAclFromHeaders(parseAclParams, (err, parsedACL) => {
                if (err) {
                    log.debug('error parsing acl from headers', {
                        error: err,
                    });
                    return callback(err);
                }
                bucket.setFullAcl(parsedACL);
                return callback(null, bucket);
            });
        },
        getAnyExistingBucketInfo: function getAnyExistingBucketInfo(callback) {
            metadata.getBucket(bucketName, log, (err, data) => {
                if (err && err.NoSuchBucket) {
                    return callback(null, 'NoBucketYet');
                }
                if (err) {
                    return callback(err);
                }
                return callback(null, data);
            });
        },
    },
    // Function to run upon finishing both parallel requests
    (err, results) => {
        if (err) {
            return cb(err);
        }
        const existingBucketMD = results.getAnyExistingBucketInfo;
        if (existingBucketMD instanceof BucketInfo &&
            existingBucketMD.getOwner() !== canonicalID) {
            // return existingBucketMD to collect cors headers
            return cb(errors.BucketAlreadyExists, existingBucketMD);
        }
        const newBucketMD = results.prepareNewBucketMD;
        if (existingBucketMD === 'NoBucketYet') {
            return bucketLevelServerSideEncryption(
                bucketName, headers, log,
                (err, sseInfo) => {
                    if (err) {
                        return cb(err);
                    }
                    newBucketMD.setServerSideEncryption(sseInfo);
                    log.trace(
                        'new bucket without flags; adding transient label');
                    newBucketMD.addTransientFlag();
                    return freshStartCreateBucket(newBucketMD, canonicalID,
                                                  log, cb);
                });
        }
        if (existingBucketMD.hasTransientFlag() ||
            existingBucketMD.hasDeletedFlag()) {
            log.trace('bucket has transient flag or deleted flag. cleaning up');
            return cleanUpBucket(newBucketMD, canonicalID, log, cb);
        }
        // If bucket exists in non-transient and non-deleted
        // state and owned by requester then return BucketAlreadyOwnedByYou
        // error unless old AWS behavior (us-east-1)
        // ** For old behavior: **
        // 1) new locationConstraint should either be undefined or have a
        // region named us-east-1
        // 2) the existing locationConstraint must have a region named
        // us-east-1 or undefined
        // 3) only for old config the s3 being hit must be set up to have
        // usEastBehavior
        // ** For new behavior: **
        // 1) new locationConstraint should have legacyAwsBehavior === true
        // 2) the existing locationConstraint must have legacyAwsBehavior ===
        // true
        // Note: we are not using usEastBehavior any longer
        if ((!locationConstraint && usEastBehavior ||
            isLegacyAWSBehavior(locationConstraint, usEastBehavior))
            && (!existingBucketMD.getLocationConstraint() && usEastBehavior ||
            isLegacyAWSBehavior(existingBucketMD.getLocationConstraint(),
            usEastBehavior))) {
            log.trace('returning 200 instead of 409 to mirror us-east-1');
            return cb(null, existingBucketMD);
        }
        return cb(errors.BucketAlreadyOwnedByYou, existingBucketMD);
    });
}

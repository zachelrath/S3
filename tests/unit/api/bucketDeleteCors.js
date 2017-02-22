import assert from 'assert';

import bucketPut from '../../../lib/api/bucketPut';
import bucketPutCors from '../../../lib/api/bucketPutCors';
import bucketDeleteCors from '../../../lib/api/bucketDeleteCors';
import { cleanup,
    DummyRequestLogger,
    makeAuthInfo,
    CorsConfigTester } from '../helpers';
import metadata from '../../../lib/metadata/wrapper';
import config from '../../../lib/Config';

const log = new DummyRequestLogger();
const authInfo = makeAuthInfo('accessKey1');
const bucketName = 'bucketname';
const locationConstraint = config.locationConstraints ? 'aws-us-east-1' :
'us-east-1';

const corsUtil = new CorsConfigTester();

const testBucketPutRequest = {
    bucketName,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
};
const testBucketPutCorsRequest =
    corsUtil.createBucketCorsRequest('PUT', bucketName);
const testBucketDeleteCorsRequest =
    corsUtil.createBucketCorsRequest('DELETE', bucketName);

describe('deleteBucketCors API', () => {
    beforeEach(done => {
        cleanup();
        bucketPut(authInfo, testBucketPutRequest, locationConstraint, log,
        () => {
            bucketPutCors(authInfo, testBucketPutCorsRequest, log, done);
        });
    });
    afterEach(() => cleanup());

    it('should delete a bucket\'s cors configuration in metadata', done => {
        bucketDeleteCors(authInfo, testBucketDeleteCorsRequest, log,
        err => {
            if (err) {
                process.stdout.write(`Unexpected err ${err}`);
                return done(err);
            }
            return metadata.getBucket(bucketName, log, (err, bucket) => {
                if (err) {
                    process.stdout.write(`Err retrieving bucket MD ${err}`);
                    return done(err);
                }
                assert.strictEqual(bucket.getCors(), null);
                return done();
            });
        });
    });
});

import assert from 'assert';
import { Logger } from 'werelogs';

import config from '../../../lib/Config';
import DummyRequest from '../DummyRequest';
import wrapper from '../../../lib/data/wrapper';

const namespace = 'default';
const bucketName = 'bucketname';

const testPutBucketRequest = new DummyRequest({
    bucketName,
    namespace,
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
});

const testPutObjectRequest = new DummyRequest({
    bucketName,
    namespace,
    objectKey: 'objectName',
    headers: { host: `${bucketName}.s3.amazonaws.com` },
    url: '/',
}, new Buffer('I am a body'));


const logger = new Logger('FileDataBackend', {
    logLevel: config.log.logLevel,
    dumpLevel: config.log.dumpLevel,
});

const log = logger.newRequestLogger();

describe('test kinetic', () => {
    const keys = [];
    it('should put an object', done => {
        const objectKeyContext = {
            bucketName,
            owner:'79a59df900b949e55d96a1e698fbacedfd6e09d98eacf8f8d5218e7cd47ef2be',
            namespace,
        };
        wrapper.put(
            null, testPutObjectRequest, 11, objectKeyContext, log, (err, key) => {
                if (err) {
                    done(err);
                } else {
                    keys.push(key);
                    done();
                }
            });
    });

    it('should get an object', done => {
        keys.forEach((keyContext) => {
            wrapper.get(keyContext, log, (err, value) => {
                if (err) {
                    done(err);
                } else {
                    console.log(value);
                    done();
                }
            });
        });
    });
});

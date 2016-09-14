import assert from 'assert';
import child_process from 'child_process';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { S3 } from 'aws-sdk';


const random = Math.round(Math.random() * 100).toString();
const bucket = `ftest-mybucket-${random}`;


const basePath = path.join(__dirname, '../../../../..');
const httpsCert = fs.readFileSync(`${basePath}/httpsCerts/ca.crt`,
    'ascii');
const config = {
    accessKeyId: 'accessKey1',
    secretAccessKey: 'verySecretKey1',
    sslEnabled: true,
    httpOptions: {
        rejectUnauthorized: false,
        agent: new https.Agent({ ca: [httpsCert] }),
    },
    logger: process.stdout,
    endpoint: 'https://127.0.0.1:8000',
    apiVersions: { s3: '2006-03-01' },
    signatureCache: false,
    signatureVersion: 'v4',
    s3DisableBodySigning: false,
    region: 'us-east-1',
    s3ForcePathStyle: true,
};

const s3 = new S3(config);

function createFile(name, bytes, callback) {
    process.stdout.write(`dd if=/dev/urandom of=${name} bs=${bytes} count=1\n`);
    child_process.spawn('dd', ['if=/dev/urandom', `of=${name}`,
        `bs=${bytes}`, 'count=1'], { stdio: 'inherit' }).on('exit', code => {
            assert.strictEqual(code, 0);
            callback();
        });
}

describe.only('streaming auth v4', function testSuite() {
    this.timeout(60000);

    before( done => {
        createFile('myfile', 10048576, done);
    });


    it('should create a bucket', function createbucket(done) {
        s3.createBucket({ Bucket: bucket }, (err) => {
            if (err) {
                return done(new Error(`error creating bucket: ${err}`));
            }
            done();
        });
    });


    it('should put a stream object', function streamObject(done) {
        const rs = fs.createReadStream('myfile');
        s3.putObject({ Bucket: bucket, Key: 'stream',
            Body: rs }, err => {
            if (err) {
                console.log('err!!', err)
                return done(new Error(`error putting object: ${err}`));
            }
            done();
        });
    });
});

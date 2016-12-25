import assert from 'assert';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import async from 'async';

import { S3 } from 'aws-sdk';

import conf from '../../../../../lib/Config';
import getConfig from '../support/config';
import { WebsiteConfigTester } from '../../lib/utility/website-util';

const config = getConfig('default', { signatureVersion: 'v4' });
const s3 = new S3(config);

const transport = conf.https ? https : http;
const bucket = process.env.AWS_ON_AIR ? 'awsbucketwebsitetester' :
    'bucketwebsitetester';
const hostname = `${bucket}.s3-website-us-east-1.amazonaws.com`;

const port = process.env.AWS_ON_AIR ? 80 : 8000;


function putBucketWebsiteObjectCors(corsParams, done) {
    const webConfig = new WebsiteConfigTester('index.html');
    async.waterfall([
        next => s3.putBucketWebsite({ Bucket: bucket,
            WebsiteConfiguration: webConfig }, next),
        (err, next) => s3.putObject({ Bucket: bucket,
            Key: 'index.html',
            ACL: 'public-read',
            Body: fs.readFileSync(path.join(__dirname,
                '/websiteFiles/index.html')),
            ContentType: 'text/html' }, next),
        (err, next) => s3.putBucketCors(corsParams, next),
    ], done);
}

function deleteBucketCorsObject(done) {
    s3.deleteBucketCors({ Bucket: bucket }, err => {
        if (err) {
            return done(err);
        }
        return s3.deleteObject({ Bucket: bucket,
        Key: 'index.html' }, done);
    });
}

function optionRequest(headers, statusCode, headersResponse, done) {
    const options = {
        hostname,
        port,
        method: 'OPTIONS',
        headers,
    };
    const req = transport.request(options, res => {
        const body = [];
        res.on('data', chunk => {
            body.push(chunk);
        });
        res.on('error', err => {
            process.stdout.write('err on post response');
            return done(err);
        });
        res.on('end', () => {
            const total = body.join('');
            if (statusCode) {
                assert.deepEqual(res.statusCode, statusCode,
                `status code expected: ${statusCode}`);
                if (statusCode === 403) {
                    assert(total.indexOf(
                      '<head><title>403 Forbidden</title></head>') > -1);
                }
            }
            if (headersResponse) {
                Object.keys(headersResponse).forEach(key => {
                    assert.deepEqual(res.headers[key], headersResponse[key],
                      `error header: ${key}`);
                });
            }
            done();
        });
    });

    req.on('error', err => {
        process.stdout.write('err from post request');
        return done(err);
    });
    req.end();
}

describe('getBucketCors', () => {
    beforeEach(done => {
        s3.createBucket({ Bucket: bucket }, done);
    });
    afterEach(done => {
        s3.deleteBucket({ Bucket: bucket }, done);
    });

    describe('allow PUT, POST, DELETE, GET methods and allow only ' +
    'one origin', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'PUT', 'POST', 'DELETE', 'GET',
                        ],
                        AllowedOrigins: [
                            'http://www.allowedwebsite.com',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with allowed origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': 'http://www.allowedwebsite.com',
                'access-control-allow-methods': 'PUT, POST, DELETE, GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with not allowed request headers', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Origin, Accept, ' +
                'Content-Type',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with not allowed origin', done => {
            const headers = {
                'Origin': 'http://www.forbiddenwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with listed method "POST"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            const headersResponse = {
                'access-control-allow-origin': 'http://www.allowedwebsite.com',
                'access-control-allow-methods': 'PUT, POST, DELETE, GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with listed method "PUT"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            const headersResponse = {
                'access-control-allow-origin': 'http://www.allowedwebsite.com',
                'access-control-allow-methods': 'PUT, POST, DELETE, GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with listed method "DELETE"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            const headersResponse = {
                'access-control-allow-origin': 'http://www.allowedwebsite.com',
                'access-control-allow-methods': 'PUT, POST, DELETE, GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
    });

    describe('CORS allows method GET and allows one origin', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'GET',
                        ],
                        AllowedOrigins: [
                            'http://www.allowedwebsite.com',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with listed origin header', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': 'http://www.allowedwebsite.com',
                'access-control-allow-methods': 'GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed request headers', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Origin, Accept, ' +
                'Content-Type',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed origin', done => {
            const headers = {
                'Origin': 'http://www.forbiddenwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "POST"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "PUT"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method "DELETE"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            optionRequest(headers, 403, null, done);
        });
    });

    describe('CORS allows method GET and allows all origins', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'GET',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed request headers', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Origin, Accept, ' +
                'Content-Type',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with a different origin', done => {
            const headers = {
                'Origin': 'http://www.forbiddenwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed method: "POST"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "PUT"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method "DELETE"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            optionRequest(headers, 403, null, done);
        });
    });
    describe('CORS allows method POST and allows all origins', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'POST',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'POST',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed method: "PUT"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "DELETE"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method "GET"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            optionRequest(headers, 403, null, done);
        });
    });

    describe('CORS allows method PUT and allows all origins', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'PUT',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'PUT',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed method: "DELETE"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "POST"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method "GET"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            optionRequest(headers, 403, null, done);
        });
    });

    describe('CORS allows method DELETE and allows all origins', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'DELETE',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'DELETE',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'DELETE',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed method: "PUT"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'PUT',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method: "POST"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'POST',
            };
            optionRequest(headers, 403, null, done);
        });
        it('send OPTIONS request with non-listed method "GET"', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            optionRequest(headers, 403, null, done);
        });
    });

    describe('CORS allows method GET, allows all origins and allows ' +
    'header content-type', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'GET',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                        AllowedHeaders: [
                            'Content-Type',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('send OPTIONS request with lised origin', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with listed request header "Content-Type"',
        done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Content-Type',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET',
                'access-control-allow-headers': 'content-type',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
        it('send OPTIONS request with non-listed request headers',
        done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'Origin, Accept, ' +
                'Content-Type',
            };
            optionRequest(headers, 403, null, done);
        });
    });

    describe('CORS exposes headers', () => {
        const corsParams = {
            Bucket: bucket,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedMethods: [
                            'GET',
                        ],
                        AllowedOrigins: [
                            '*',
                        ],
                        AllowedHeaders: [
                            'Content-Type',
                        ],
                        ExposeHeaders: [
                            'x-amz-server-side-encryption',
                            'x-amz-request-id',
                            'x-amz-id-2',
                        ],
                    },
                ],
            },
        };
        beforeEach(done => {
            putBucketWebsiteObjectCors(corsParams, done);
        });

        afterEach(done => {
            deleteBucketCorsObject(done);
        });

        it('should return response with expose headers header', done => {
            const headers = {
                'Origin': 'http://www.allowedwebsite.com',
                'Access-Control-Request-Method': 'GET',
            };
            const headersResponse = {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET',
                'access-control-expose-headers':
                'x-amz-server-side-encryption, x-amz-request-id, x-amz-id-2',
            };
            optionRequest(headers, 204, headersResponse, done);
        });
    });
});

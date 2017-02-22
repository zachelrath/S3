import assert from 'assert';
import async from 'async';
import fs from 'fs';
import path from 'path';
import url from 'url';

import makeRequest from '../../../raw-node/utils/makeRequest';

let awsCredentials;

function _parseConfigValue(string, fileSlice) {
    const line = fileSlice.find(element => element.indexOf(string) > -1);
    const keyValue = line.replace(/ /g, '').split('=');
    // the element after the '=' should be the value
    return keyValue[1];
}

function _retrieveAWSCredentials(profile) {
    const filename = path.join(process.env.HOME, '/.aws/scality');
    let file;

    try {
        file = fs.readFileSync(filename, 'utf8');
    } catch (e) {
        const msg = `AWS credential file does not exist: ${filename}`;
        throw new Error(msg);
    }

    const fileContents = file.split('\n');
    const profileIndex = file.indexOf(`[${profile}]`);
    if (profileIndex > -1) {
        const accessKey = _parseConfigValue('aws_access_key_id',
            fileContents.slice(profileIndex));
        const secretKey = _parseConfigValue('aws_secret_access_key',
            fileContents.slice(profileIndex));
        return { accessKey, secretKey };
    }
    const msg = `Profile ${profile} does not exist in AWS credential file`;
    throw new Error(msg);
}

if (process.env.AWS_ON_AIR) {
    awsCredentials = _retrieveAWSCredentials('default');
}

function _makeWebsiteRequest(auth, method, urlstring, callback) {
    let authCredentials;
    if (auth === 'validAuth') {
        authCredentials = awsCredentials || {
            accessKey: 'accessKey1',
            secretKey: 'verySecretKey1',
        };
    } else if (auth === 'invalidAuth') {
        authCredentials = {
            accessKey: 'fakeKey1',
            secretKey: 'fakeSecretKey1',
        };
    } else if (!auth) {
        authCredentials = undefined;
    } else {
        throw new Error(`Unsupported auth type ${auth}`);
    }
    const { hostname, port, path } = url.parse(urlstring);
    makeRequest({ hostname, port, method, path, authCredentials }, callback);
}

function _assertResponseHtml(response, elemtag, content) {
    if (elemtag === 'ul') {
        const startIndex = response.indexOf('<ul>');
        const endIndex = response.indexOf('</ul>');
        assert(startIndex > -1 && endIndex > -1, 'Did not find ul element');
        const ulElem = response.slice(startIndex + 4, endIndex);
        content.forEach(item => {
            _assertResponseHtml(ulElem, 'li', item);
        });
    } else {
        const elem = `<${elemtag}>${content}</${elemtag}>`;
        assert(response.includes(elem),
            `Expected but did not find '${elem}' in html`);
    }
}

function _assertContainsHtml(responseBody) {
    assert(responseBody.startsWith('<html>') &&
        responseBody.includes('</html>'), 'Did not find html tags');
}

function _assertResponseHtml404(method, response, type, bucketName) {
    assert.strictEqual(response.statusCode, 404);
    if (method === 'HEAD') {
        if (type !== '404-no-such-bucket'
        && type !== '404-no-such-website-configuration'
        && type !== '404-not-found') {
            throw new Error('This 404 error is not checked in ' +
            'checkHTML()');
        }
        // don't need to check HTML for head requests
        return;
    }
    _assertContainsHtml(response.body);
    _assertResponseHtml(response.body, 'title', '404 Not Found');
    _assertResponseHtml(response.body, 'h1', '404 Not Found');
    if (type === '404-no-such-bucket') {
        _assertResponseHtml(response.body, 'ul', [
            'Code: NoSuchBucket',
            'Message: The specified bucket does not exist.',
            `BucketName: ${bucketName}`,
        ]);
    } else if (type === '404-no-such-website-configuration') {
        _assertResponseHtml(response.body, 'ul', [
            'Code: NoSuchWebsiteConfiguration',
            'Message: The specified bucket does not have a ' +
            'website configuration',
            `BucketName: ${bucketName}`,
        ]);
    } else if (type === '404-not-found') {
        _assertResponseHtml(response.body, 'ul', [
            'Code: NoSuchKey',
            'Message: The specified key does not exist.',
        ]);
    } else {
        throw new Error('This 404 error is not checked in ' +
        'checkHTML()');
    }
}

function _assertResponseHtml403(method, response, type) {
    assert.strictEqual(response.statusCode, 403);
    if (method === 'HEAD') {
        if (type === '403-access-denied') {
            assert.strictEqual(response.headers['x-amz-error-code'],
            'AccessDenied');
            assert.strictEqual(response.headers['x-amz-error-message'],
            'Access Denied');
        } else if (type !== '403-retrieve-error-document') {
            throw new Error('This 403 error is not checked in ' +
            'checkHTML()');
        }
    } else {
        _assertContainsHtml(response.body);
        _assertResponseHtml(response.body, 'title', '403 Forbidden');
        _assertResponseHtml(response.body, 'h1', '403 Forbidden');
        _assertResponseHtml(response.body, 'ul', [
            'Code: AccessDenied',
            'Message: Access Denied',
        ]);
        if (type === '403-retrieve-error-document') {
            _assertResponseHtml(response.body, 'h3',
            'An Error Occurred While Attempting to ' +
            'Retrieve a Custom Error Document');
            const startIndex = response.body.indexOf('</h3>') + 5;
            _assertResponseHtml(response.body.slice(startIndex),
            'ul', [
                'Code: AccessDenied',
                'Message: Access Denied',
            ]);
        } else if (type !== '403-access-denied') {
            throw new Error('This 403 error is not checked in ' +
            'checkHTML()');
        }
    }
}

function _assertResponseHtmlErrorUser(response, type) {
    if (type === 'error-user') {
        assert.strictEqual(response.statusCode, 403);
    } else if (type === 'error-user-404') {
        assert.strictEqual(response.statusCode, 404);
    }
    _assertResponseHtml(response.body, 'title',
        'Error!!');
    _assertResponseHtml(response.body, 'h1',
        'It appears you messed up');
}

function _assertResponseHtmlIndexUser(response) {
    assert.strictEqual(response.statusCode, 200);
    _assertResponseHtml(response.body, 'title',
        'Best testing website ever');
    _assertResponseHtml(response.body, 'h1', 'Welcome to my ' +
        'extraordinary bucket website testing page');
}

function _assertResponseHtmlRedirect(response, type, redirectUrl, method) {
    if (type === 'redirect' || type === 'redirect-user') {
        assert.strictEqual(response.statusCode, 301);
        assert.strictEqual(response.body, '');
        assert.strictEqual(response.headers.location, redirectUrl);
    } else if (type === 'redirected-user') {
        assert.strictEqual(response.statusCode, 200);
        if (method === 'HEAD') {
            return;
            // no need to check HTML
        }
        _assertResponseHtml(response.body, 'title',
        'Best redirect link ever');
        _assertResponseHtml(response.body, 'h1',
        'Welcome to your redirection file');
    } else {
        throw new Error('This redirect type is not checked in ' +
        'checkHTML()');
    }
}

export class WebsiteConfigTester {
    constructor(indexDocument, errorDocument, redirectAllReqTo) {
        if (indexDocument) {
            this.IndexDocument = {};
            this.IndexDocument.Suffix = indexDocument;
        }
        if (errorDocument) {
            this.ErrorDocument = {};
            this.ErrorDocument.Key = errorDocument;
        }
        if (redirectAllReqTo) {
            this.RedirectAllRequestsTo = redirectAllReqTo;
        }
    }
    addRoutingRule(redirectParams, conditionParams) {
        const newRule = {};
        if (!this.RoutingRules) {
            this.RoutingRules = [];
        }
        if (redirectParams) {
            newRule.Redirect = {};
            Object.keys(redirectParams).forEach(key => {
                newRule.Redirect[key] = redirectParams[key];
            });
        }
        if (conditionParams) {
            newRule.Condition = {};
            Object.keys(conditionParams).forEach(key => {
                newRule.Condition[key] = conditionParams[key];
            });
        }
        this.RoutingRules.push(newRule);
    }

    static checkHTML(auth, method, url, type, redirectUrl, bucketName,
        callback) {
        _makeWebsiteRequest(auth, method, url, (err, res) => {
            assert.strictEqual(err, null, `Unexpected request err ${err}`);
            if (type) {
                if (type.startsWith('404')) {
                    _assertResponseHtml404(method, res, type, bucketName);
                } else if (type.startsWith('403')) {
                    _assertResponseHtml403(method, res, type);
                } else if (type.startsWith('error-user')) {
                    _assertResponseHtmlErrorUser(res, type);
                } else if (type.startsWith('redirect')) {
                    _assertResponseHtmlRedirect(res, type, redirectUrl, method);
                    if (type === 'redirect-user') {
                        process.stdout.write('Following redirect location\n');
                        return this.checkHTML(null, method,
                        res.headers.location, 'redirected-user', null, null,
                        callback);
                    }
                } else if (type === 'index-user') {
                    _assertResponseHtmlIndexUser(res);
                } else {
                    throw new Error('This is not checked in checkHTML()');
                }
            }
            return callback();
        });
    }

    /**
     * makeHeadRequest - makes head request and asserts expected response
     * @param {(string|null)} auth - whether to use valid, invalid,
     * or no authentication credentials
     * @param {string} url - request url
     * @param {number} expectedStatusCode - expected response code
     * @param {object} expectedHeaders - expected headers in response with
     * expected values (e.g., {x-amz-error-code: AccessDenied})
     * @param {string | undefined} path - path for request or undefined if none
     * @param {function} cb - callback to end test
     * @return {undefined}
     */
    static makeHeadRequest(auth, url, expectedStatusCode, expectedHeaders, cb) {
        _makeWebsiteRequest(auth, 'HEAD', url, (err, res) => {
            // body should be empty
            assert.deepStrictEqual(res.body, '');
            assert.strictEqual(res.statusCode, expectedStatusCode);
            const headers = Object.keys(expectedHeaders);
            for (let i = 0; i < headers.length; i++) {
                assert.strictEqual(res.headers[headers[i]],
                    expectedHeaders[headers[i]]);
            }
            return cb();
        });
    }

    static createPutBucketWebsite(s3, bucket, bucketACL, objects, done) {
        s3.createBucket({ Bucket: bucket, ACL: bucketACL },
        err => {
            if (err) {
                return done(err);
            }
            const webConfig = new WebsiteConfigTester('index.html',
              'error.html');
            return s3.putBucketWebsite({ Bucket: bucket,
            WebsiteConfiguration: webConfig }, err => {
                if (err) {
                    return done(err);
                }
                return async.forEachOf(objects,
                (acl, object, next) => {
                    s3.putObject({ Bucket: bucket,
                        Key: `${object}.html`,
                        ACL: acl,
                        Body: fs.readFileSync(path.join(__dirname,
                            `/../../test/object/websiteFiles/${object}.html`)),
                        },
                        next);
                }, done);
            });
        });
    }

    static deleteObjectsThenBucket(s3, bucket, objects, done) {
        async.forEachOf(objects, (acl, object, next) => {
            s3.deleteObject({ Bucket: bucket,
                Key: `${object}.html` }, next);
        }, err => {
            if (err) {
                return done(err);
            }
            return s3.deleteBucket({ Bucket: bucket }, done);
        });
    }
}

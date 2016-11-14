'use strict'; // eslint-disable-line strict

const fs = require('fs');
const assert = require('assert');
const http = require('http');
const https = require('https');
const async = require('async');
const Redis = require('ioredis');

const conf = require('../../config.json');
const defaultRedis = {
    host: 'localhost',
    port: 6379,
};
const redis = new Redis({
    host: defaultRedis.host,
    port: defaultRedis.port,
    // disable offline queue
    enableOfflineQueue: false,
});

const transportStr = conf.transport;
const transport = transportStr === 'http' ? http : https;
const options = {
    host: conf.ipAddress,
    path: '/_/healthcheck',
    port: 8000,
};

function makeChecker(expectedStatus, done) {
    return res => {
        const actualStatus = res.statusCode;
        assert.strictEqual(actualStatus, expectedStatus);
        done();
    };
}

function deepCopy(options) {
    return JSON.parse(JSON.stringify(options));
}

function makeAgent() {
    if (transportStr === 'https') {
        const newAgent = new https.Agent({
            ca: fs.readFileSync(conf.caCertPath),
        });
        return newAgent;
    }
    return undefined;
}

function makeRequest(httpMethod, httpCode, cb) {
    const getOptions = deepCopy(options);
    getOptions.method = httpMethod;
    getOptions.agent = makeAgent();
    const req = transport.request(getOptions, makeChecker(httpCode, cb));
    req.end();
}

function makeDummyS3Request(cb) {
    const getOptions = deepCopy(options);
    getOptions.path = '/';
    getOptions.method = 'GET';
    getOptions.agent = makeAgent();
    const req = transport.request(getOptions);
    req.end(() => cb());
}

function makeStatsRequest(cb) {
    const getOptions = deepCopy(options);
    getOptions.method = 'GET';
    getOptions.agent = makeAgent();
    const req = transport.request(getOptions, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks).toString()));
    });
    req.on('error', err => cb(err));
    req.end();
}

describe('Healthcheck routes', () => {
    it('should return 200 OK on GET request', done => makeRequest('GET', 200,
        done));

    it('should return 200 OK on POST request', done => makeRequest('POST',
        200, done));

    it('should return 400 on other requests', done => makeRequest('PUT', 400,
        done));
});


describe('Healthcheck stats', () => {
    const totalReqs = 5;
    beforeEach(done => {
        redis.flushdb(() => {
            async.times(totalReqs, (n, next) => makeDummyS3Request(next), done);
        });
    });

    afterEach(done => redis.flushdb(done));

    it('should respond back with total requests', done =>
        makeStatsRequest((err, res) => {
            if (err) {
                return done(err);
            }
            const expectedStatsRes = { 'requests': totalReqs, '500s': 0,
                'sampleDuration': 30 };
            assert.deepStrictEqual(JSON.parse(res), expectedStatsRes);
            return done();
        })
    );
});

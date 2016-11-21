const assert = require('assert');
// for now added web3 to package.json.  way to install instead when
// this predicate is registered?
const Web3 = require('web3');

const ETHEREUM_CLIENT = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

const contractABI = [{"constant":true,"inputs":[],"name":"getPayers","outputs":[{"name":"","type":"bytes32[]"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"uint256"}],"name":"payers","outputs":[{"name":"","type":"bytes32"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"withdraw","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"getPrice","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_email","type":"bytes32"}],"name":"addPayer","outputs":[{"name":"success","type":"bool"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"price","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"newPrice","type":"uint256"}],"name":"changePrice","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"payable":false,"type":"function"},{"inputs":[],"type":"constructor"}];

const contractAddress = '0x77e1918017e0b80a486a72fcb65b182312055458';

const microPayK = ETHEREUM_CLIENT.eth.contract(contractABI).at(contractAddress);

// use 3 arguments like AWS (event, context, cb)?
module.exports = function payForContent(params, callback) {
    assert.strictEqual('object', typeof params.Records[0].s3);
    const s3 = params.Records[0].s3;
    const bucket = s3.bucket.name;
    console.log("bucket in predicate!!", bucket);
    console.log("params.Records[0].userIdentity!!", params.Records[0].userIdentity)
    const requester = params.Records[0].userIdentity.principalEmail;
    console.log("requester in predicate!!", requester);
    // need 32 bytes in hex, padding option not working
    let hexRequester = ETHEREUM_CLIENT.fromAscii(requester, 32);
    if (hexRequester.length < 66) {
        const pad = '000000000000000000000000000000000'
            .slice(0, 66 - hexRequester.length);
        hexRequester += pad;
    }
    console.log("hexRequester!!", hexRequester);

    // this should be async...
    const payers = microPayK.getPayers();
    console.log("payers!!", payers)

    if (payers.indexOf(hexRequester) > -1) {
        console.log("requester paid!!")
        return callback();
    }
    console.log("requester did not pay!!");
    return callback('FAIL');
};

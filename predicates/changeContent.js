const assert = require('assert');
// for now added gm to package.json.  way to install instead when
// this predicate is registered?
const gm = require('gm');

// use 3 arguments like AWS (event, context, cb)?
module.exports = function changeContent(params, context, callback) {
    console.log("in changeContent!!");
    assert.strictEqual('object', typeof params.Records[0].s3);
    const s3 = params.Records[0].s3;
    const body = s3.object.body;
    body.setMode('transform');
    const chunks = [];
    body.on('data', d => chunks.push(d))
        .on('end', () => {
            const got = Buffer.concat(chunks);
            console.log("got!!", got)
            gm(got, 'image.jpg')
            .flip()
            // .magnify()
            // .rotate('green', 45)
            .toBuffer('JPG', function (err, buffer) {
                console.log("buffer after toBuffer!!", buffer)
                if (err) {
                    console.log("err in predicate!!", err)
                    return callback(err);
                }
                body.end(buffer);
                console.log("wrote buffer back!!");
                return callback();
            });
        });
    }

        //     .stream(function (err, out) {
        //         if (err) {
        //             console.log("err from stream!!", err);
        //             return callback(err);
        //         }
        //         const afterChunks = [];
        //         out.on('data', d => {
        //             console.log("got data from stream!!", d);
        //             afterChunks.push(d);
        //         });
        //         out.on('err', err => {
        //             console.log("err getting chunks after!!", err)
        //             return callback(err);
        //         });
        //         out.on('end', err => {
        //             if (err) {
        //                 console.log("err on end!!", err);
        //                 return callback(err);
        //             }
        //             console.log("afterChunks!!", afterChunks)
        //             body.end(Buffer.concat(afterChunks));
        //             return callback();
        //         });
        //     });
        // });
// };
        //     .stream(function (err, out) {
        //         if (err) {
        //             console.log("err streaming back!!", err);
        //             return callback(err);
        //         }
        //         out.pipe(body);
        //         out.on('end', err => {
        //             return callback(err);
        //         });
        //     });
        // });
// };
    // crazytown
    // gm(body)
    // .flip()
    // .magnify()
    // .rotate('green', 45)
    // .blur(7, 3)
    // .crop(300, 300, 150, 130)
    // .edge(3)
    // .stream(function (err, stdout) {
    //     if (err) {
    //         console.log("err streaming back!!", err);
    //         return callback(err);
    //     }
    //     stdout.pipe(body);
    //     stdout.on('end', err => {
    //         return callback(err);
    //     });
    // });
// };

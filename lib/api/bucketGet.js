import services from '../services';
import config from '../Config.js'

import querystring from 'querystring';

//	Sample XML response:
/*	<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>example-bucket</Name>
  <Prefix></Prefix>
  <Marker></Marker>
  <MaxKeys>1000</MaxKeys>
  <Delimiter>/</Delimiter>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>sample.jpg</Key>
    <LastModified>2011-02-26T01:56:20.000Z</LastModified>
    <ETag>&quot;bf1d737a4d46a19f3bced6905cc8b902&quot;</ETag>
    <Size>142863</Size>
    <Owner>
      <ID>canonical-user-id</ID>
      <DisplayName>display-name</DisplayName>
    </Owner>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <CommonPrefixes>
    <Prefix>photos/</Prefix>
  </CommonPrefixes>
</ListBucketResult>*/

/**
 * bucketGet - Return list of objects in bucket
 * @param  {AuthInfo} authInfo - Instance of AuthInfo class with
 *                               requester's info
 * @param  {object} request - http request object
 * @param  {function} log - Werelogs request logger
 * @param  {function} callback - callback to respond to http request
 *  with either error code or xml response body
 * @return {undefined}
 */
export default function bucketGet(authInfo, request, log, callback) {
    log.debug('processing request', { method: 'bucketGet' });
    const params = request.query;
    const bucketName = request.bucketName;
    const encoding = params['encoding-type'];
    const maxKeys = params['max-keys'] ?
        Number.parseInt(params['max-keys'], 10) : 1000;
    const metadataValParams = {
        authInfo,
        bucketName,
        requestType: 'bucketGet',
        log,
    };
    const listParams = {
        maxKeys,
        delimiter: params.delimiter,
        marker: params.marker,
        // <versioning>
        // versioning listing format: GET /bucket/?versions[&option=value]
        //   prefix for normal listing : A|
        //   prefix for version listing: V|
        prefix: (params.prefix ?
            (params.prefix.indexOf(config.versioning.separator) > 0 ?
            params.prefix : config.versioning.masterPrefix +
            config.versioning.separator) : config.versioning.masterPrefix +
            config.versioning.separator),
        // </versioning>
    };

    /**
     * Remove the prefix and the versionId information from result keys.
     * @param {string} key - a key in the listing result
     * @return {string} - prefix- and version- trimmed key
     */
    function trimKey(key) {
        let trimmedKey = key;
        trimmedKey = key.slice(key.indexOf(config.versioning.separator) +
            config.versioning.separator.length);
        const vIndex = trimmedKey.indexOf(config.versioning.separator);
        return (vIndex > 0 ? trimmedKey.slice(0, vIndex) : trimmedKey);
    }

    services.metadataValidateAuthorization(metadataValParams, err => {
        if (err) {
            log.debug('error processing request', { error: err });
            return callback(err);
        }
        return services.getObjectListing(bucketName, listParams, log,
        (err, list) => {
            if (err) {
                log.debug('error processing request', { error: err });
                return callback(err);
            }
            const xml = [];
            xml.push(
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/' +
                    '2006-03-01/">',
                `<Name>${bucketName}</Name>`
            );
            const isTruncated = list.IsTruncated ? 'true' : 'false';
            const xmlParams = [
                // <versioning>
                // there is always prefix in any case
                { tag: 'Prefix', value: trimKey(listParams.prefix) },
                // </versioning>
                { tag: 'NextMarker', value: list.NextMarker },
                { tag: 'Marker', value: listParams.marker },
                { tag: 'MaxKeys', value: listParams.maxKeys },
                { tag: 'Delimiter', value: listParams.delimiter },
                { tag: 'IsTruncated', value: isTruncated },
            ];

            xmlParams.forEach(param => {
                if (param.value) {
                    xml.push(`<${param.tag}>${param.value}</${param.tag}>`);
                } else {
                    xml.push(`<${param.tag}/>`);
                }
            });

            list.Contents.forEach(item => {
                const v = item.value;
                // <versioning>
                // trim the extra versioning information from each result key
                const objectKey = trimKey(encoding === 'url' ?
                    querystring.escape(item.key) : item.key);
                // </versioning>

                xml.push(
                    '<Contents>',
                    `<Key>${objectKey}</Key>`,
                    `<LastModified>${v.LastModified}</LastModified>`,
                    `<ETag>${v.ETag}</ETag>`,
                    `<Size>${v.Size}</Size>`,
                    '<Owner>',
                    `<ID>${v.Owner.ID}</ID>`,
                    `<DisplayName>${v.Owner.DisplayName}</DisplayName>`,
                    '</Owner>',
                    `<StorageClass>${v.StorageClass}</StorageClass>`,
                    '</Contents>'
                );
            });
            list.CommonPrefixes.forEach(item => {
                xml.push(
                    `<CommonPrefixes><Prefix>${item}</Prefix></CommonPrefixes>`
                );
            });
            xml.push('</ListBucketResult>');
            return callback(null, xml.join(''));
        });
    });
}

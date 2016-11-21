// cacheControl, cacheDisposition,
//     contentEncoding, expires, contentLength, contentType, lastModified,
//     contentMd5

// acl, contentMetaHeaders, xAmzHeaders, sse
export default class ObjectInfo {
    constructor(name, ownerDisplayName, ownerId, contentLength, lastModified) {
        this._name = name;
        this._ownerDisplayName = ownerDisplayName;
        this._ownerId = ownerId;
        this._contentLength = contentLength;
        this._lastModified = lastModified || new Date().toJSON();
        this._storageClass = 'STANDARD';
        this._acl = {
            Canned: 'private',
            FULL_CONTROL: [],
            WRITE_ACP: [],
            READ: [],
            READ_ACP: [],
        };
        this._expires = null;
        this._contentMd5 = null;
        this._contentType = null;
        this._contentEncoding = null;
        this._contentDisposition = null;
        // simple/no version. will expand once object versioning is introduced
        this._xAmzVersionId = 'null';
        this._xAmzServerVersionId = null;
        this._xAmzWebsiteRedirectLocation = null;
        // server side encryption
        this._xAmzServerSideEncryption = null;
        this._xAmzServerSideEncryptionAwsKmsKeyId = null;
        this._xAmzServerSideEncryptionCustomerAlgorithm = null;
        return this;
    }

    setStorageClass(val) {
        this._storageClass = val;
        return this;
    }

    setContentMd5(val) {
        this._contentMd5 = val;
        return this;
    }

    setContentType(val) {
        this._contentType = val;
        return this;
    }

    setContentEncoding(val) {
        this._contentEncoding = val;
        return this;
    }

    setContentDisposition(val) {
        this._contentDisposition = val;
        return this;
    }

    setVersionId(val) {
        this._versionId = val;
        return this;
    }

    setServerSideEncryptionInfo(algorithm, masterKeyId) {
        this._xAmzServerSideEncryption = algorithm;
        this._xAmzServerSideEncryptionAwsKmsKeyId = masterKeyId;
        return this;
    }

    setExpires(val) {
        this._expires = val;
        return this;
    }

    serialize() {

    }

    deSerialize() {

    }
}

# Using S3 for continuous integration testing or in production with Docker

* [For continuous integration with Docker](#for-continuous-integration-with-docker)
  * [Environment Variables](#environment-variables)
* [In production with Docker](#in-production-with-docker)
  * [Using Docker Volume in production](#using-docker-volume-in-production)
  * [Adding modifying or deleting accounts or users credentials](#adding-modifying-or-deleting-accounts-or-users-credentials)
  * [Specifying your own host name](#specifying-your-own-host-name)

## For continuous integration with Docker

When you start the Docker Scality S3 server image, you can adjust the
configuration of the Scality S3 server instance by passing one or more
environment variables on the docker run command line.

### Environment Variables

#### HOST_NAME

This variable specifies a host name.
If you have a domain such as new.host.com, by specifying that here,
you and your users can direct s3 server requests to new.host.com.

```shell
docker run -d --name s3server -p 8000:8000 -e HOST_NAME=new.host.com scality/s3server
```

Note: In your `/etc/hosts` file on Linux, OS X, or Unix with root permissions),
make sure to associate 127.0.0.1 with `new.host.com`

#### ACCESS_KEY and SECRET_KEY

These variables specify authentication credentials for an account
named "Docker".

You can set credentials for many accounts by editing `conf/authdata.json`
(see below for further info),
but if you just want to specify one set of your own,
you can use these environment variables.

```shell
docker run -d --name s3server -p 8000:8000 -e ACCESS_KEY=newAccessKey -e
SECRET_KEY=newSecretKey scality/s3server
```

#### LOG_LEVEL

This variable allows you to change the log level: info, debug or trace.
The default is info. Debug will give you more detailed logs and trace
will give you the most detailed.

```shell
docker run -d --name s3server -p 8000:8000 -e LOG_LEVEL=trace scality/s3server
```

#### SSL

This variable specifies the Common Name `<DOMAIN_NAME>` used to create the
Certificate Signing Request using OpenSSL. This allows you to run S3 with SSL:

Note: In your `/etc/hosts` file on Linux, OS X, or Unix with root permissions),
make sure to associate 127.0.0.1 with `<SUBDOMAIN>.<DOMAIN_NAME>`

```shell
docker run -d --name s3server -p 8000:8000 -e SSL=<DOMAIN_NAME> -e HOST_NAME=<SUBDOMAIN>.<DOMAIN_NAME>
scality/s3server
```

More information about how to use S3 server with SSL : [Laure's blog post link]

## In production with Docker

### Using Docker Volume in production

S3 server runs with a file backend by default.

So, by default, the data is stored inside your S3 server Docker container.

However, if you want your data and metadata to persist, you **MUST** use Docker
volumes to host your data and metadata outside your s3 server Docker container.
Otherwise, the data and metadata will be destroyed when you erase the container.

```shell
docker run -­v $(pwd)/data:/usr/src/app/localData -­v $(pwd)/metadata:/usr/src/app/localMetadata
-p 8000:8000 ­-d scality/s3server
```

This command mounts the host directory, `./data`, into the container at
/usr/src/app/localData and the host directory, `./metadata`, into the container
at /usr/src/app/localMetaData. It can also be any host mount point,
like `/mnt/data` and `/mnt/metadata`.

### Adding modifying or deleting accounts or users credentials

1. Create locally a customized `authdata.json`.

2. Use [Docker Volume](https://docs.docker.com/engine/tutorials/dockervolumes/)

to override the default `authdata.json` through a docker file mapping.
For example:

```shell
docker run -v $(pwd)/authdata.json:/usr/src/app/conf/authdata.json -p 8000:8000 -d
scality/s3server
```

### Specifying your own host name

To specify a host name (e.g. s3.domain.name),
you can provide your own
[config.json](https://github.com/scality/S3/blob/master/config.json)
using [Docker Volume](https://docs.docker.com/engine/tutorials/dockervolumes/).

First add a new key-value pair in the regions section of your config.json.
The key in the key-value pair should be your "region" name and the value
is an array containing any host name you would like to add:

```json
"regions": {

     ...

     "localregion": ["localhost"],
     "specifiedregion": ["s3.domain.name"]
},
```

Then, run your Scality S3 Server using
[Docker Volume](https://docs.docker.com/engine/tutorials/dockervolumes/):

```shell
docker run -v $(pwd)/config.json:/usr/src/app/config.json -p 8000:8000 -d scality/s3server
```

Your local `config.json` file will override the default one through a docker
file mapping.

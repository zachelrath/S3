# Indexing design

Currently the S3 API only supports search and retrieval of an object based on its unique key. However, various use cases 
require the ability to search for objects through metadata attributes since the exact object key is not available. An example 
is a lifecycle management application, that selects files for deletion based on their size and the date of their last 
modification.

The goal of the indexing module is to provide the capability to search objects based on various metadata attributes. 

## Object Metadata

There are two kinds of object metadata: system metadata and user-defined metadata.

* **System metadata** is used and processed by the S3 implementation. The following table provides some a list of system 
metadata:

| Name | Description |
|------|-------------|
| Content-Length | Object Size in Bytes | 
| Last-Modified | Object creation or last modified date |
| Content-Type | Two-part identifier conveying content format information |
| Content-MD5 | Base64-encoded 128-bit MD5 digest of the object |
| Access Control List (ACL)| Defines which accounts/groups are granted access and the type of access |

* **User-defined metadata** can be optionally assigned to an object. They are formatted as key-value pairs. When uploading an
object using the REST API, each user-defined metadata attribute is created by adding an HTTP header that begins 
```x-amz-meta-```. For example, the header ```x-amz-meta-location:Paris``` specifies the key-value attribute 
```location:Paris```. We refer to user-defined metadata as tags.

## Indexing Scheme

Let's consider a table representing the Content-Type metadata attribute. Each object is associated to a unique row 
identifier (rowId). 

| RowId | Content-Type | text/html | application/json | image/png | video/mp4 |
|-------|--------------|-----------|------------------|-----------|-----------|
| 0 | text/html | 1 | 0 | 0 | 0 |
| 1 | application/json | 0 | 1 | 0 | 0 |
| 2 | image/png | 0 | 0 | 1 | 0 |
| 3 | video/mp4 | 0 | 0 | 0 | 1 |
| 4 | text/html | 1 | 0 | 0 | 0 |
| 5 | image/png | 0 | 0 | 1 | 0 |

Generally, an index provides pointers to the rows in the table which have a certain value. A regular index stores a list 
of rowIds for each value corresponding to the rows with that value.

The main idea of our indexing scheme is the use of bitmap indexing. In a bitmap index, the list of rowIds is replaced by
a bitmap. A bitmap represents a bit sequence. Each bit position corresponds to an object. If the bit is set (has value 1), 
then the corresponding object has the attribute value that the bitmap represents. There is a bitmap for each value of the 
attribute.

In the above example, there is a bitmap for each value of the ```Content-Type``` column. The column ```text/html``` contains 
the bitmap ```100010```, indicating that the objects corresponding to the bit positions 0, 4 have the value ```text/html``` 
as their ```Content-Type```.

In that way we can respord to exact match queries on any data type simply by finding the bit positions that are set in the 
corresponding bitmap. The described encoding is refered to as equality encoding

### Range queries

However it is optimized for exact match queries, the equality encoding is not efficient for implementing range queries in ordered data, 
such as integers. Several other encodings are more efficient for processing range queries:

* **Binning** partitions the attribute values into a number of ranges and each bitmap represents a range rather than a 
unique value.

| RowId | Content-Length (MB) | [0:1024) | [1024:2048) | [2048:3072) | [3072:4096) | [4096:5120) |
|-------|--------------|------------|-------------|-------------|-------------|-------------|
| 0 | 4890 | 0 | 0 | 0 | 0 | 1 |
| 1 | 1589 | 0 | 1 | 0 | 0 | 0 |
| 2 | 861 | 1 | 0 | 0 | 0 | 0 |
| 3 | 2533 | 0 | 0 | 1 | 0 | 0 |
| 4 | 2957 | 0 | 0 | 1 | 0 | 0 |
| 5 | 4519 | 0 | 0 | 0 | 0 | 1 |

Although binning may reduce storage costs, it may increase the costs of queries that do not fall on the exact bin boundaries, 
as it may require partial search of the stored data. This encoding is optimized for two-sided range queries.

* In **range encoding** each bitmap represents a range of values ```[0, v]```. 

| RowId | Content-Length | [0:1024] | [0:2048] | [0:3072] | [0:4096] | [0:5120] |
|-------|----------------|----------|----------|----------|----------|----------|
| 0 | 4890 | 1 | 1 | 1 | 1 | 1 |
| 1 | 1589 | 1 | 1 | 0 | 0 | 0 |
| 2 | 861 | 1 | 0 | 0 | 0 | 0 |
| 3 | 2533 | 1 | 1 | 1 | 0 | 0 |
| 4 | 2957 | 1 | 1 | 1 | 0 | 0 |
| 5 | 4519 | 1 | 1 | 1 | 1 | 1 |

This encoding is optimized for one-sided range queries. A two-sided query for the values [v<sub>1</sub>, v<sub>2</sub>] 
is processed using the XOR operator between the bitmaps for the ranges [0, v<sub>1</sub>] and [0, v<sub>2</sub>].

* The **interval encoding** scheme, which is optimised both for one-sided and two-sided range queries consists of overlapping
ranges. In the above example the range could be In the above example, the ranges could be ```[0:2048], [1024:3072], 
[2048:4096], [3072:5120]```.

Moreover, dynamic programming can be used to determine the optimal partition of attribute values into ranges, based on query 
access patterns.

## Compression

Although the use of bitmap indexing is efficient for low-cardinality indexing, but present considerable storage overhead for
high-cardinality attributes, containing many distinct values. A common way to reduce memory requirements is the use of bitmap
compression. An efficient bitmap compression scheme must not only reduce the size of bitmaps but also perform bitwise 
operations efficiently. 

Research has demostrated the two most efficient bitmap compression techniques are the Byte-Aligned
Bitmap Code (BBC) and the World-Aligned Hybrid (WAH) Code. The WAH compression scheme reduces the overall query time 
significantly compared to BCC. Both schemes are based in the idea that long runs of 1s or 0s can be represented with shorter
words, called run-length encoding.

## Implementation

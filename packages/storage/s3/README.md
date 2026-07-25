# @kalayaan/storage-s3

S3-compatible media storage adapter for [Kalayaan](https://github.com/periabyte/kalayaan-cms) —
implements the `@kalayaan/core` media storage contract for uploads, the media library, and asset
serving against any S3-compatible bucket.

Requires the `aws4fetch` peer dependency. Use this when hosting media outside Cloudflare R2.

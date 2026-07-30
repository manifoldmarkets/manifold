// ---------------------------------------------------------------------------
// r2.ts — uploads delivery files to Cloudflare R2 (S3-compatible).
//
// No-op when R2 isn't configured (local-only dry runs). Uses lib-storage's
// multipart Upload so ~1GB parts stream reliably. Region is 'auto' for R2.
// ---------------------------------------------------------------------------

import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { createReadStream } from 'fs'
import { Config } from './config'

export interface Uploader {
  enabled: boolean
  upload(localPath: string, key: string): Promise<void>
}

export function makeUploader(cfg: Config): Uploader {
  const { endpoint, accessKeyId, secretAccessKey, bucket } = cfg.r2
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    return { enabled: false, async upload() {} }
  }
  // Normalize the endpoint to the account origin only. R2's S3 API endpoint is
  // https://<accountid>.r2.cloudflarestorage.com; the bucket is addressed via
  // the Bucket param with path-style. If someone pastes the endpoint with the
  // bucket appended (a common dashboard copy), strip it so we don't double it.
  const origin = (() => {
    const u = new URL(endpoint)
    return `${u.protocol}//${u.host}`
  })()
  const client = new S3Client({
    region: 'auto',
    endpoint: origin,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return {
    enabled: true,
    async upload(localPath: string, key: string): Promise<void> {
      const up = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: createReadStream(localPath) },
      })
      await up.done()
    },
  }
}

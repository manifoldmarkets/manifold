// ---------------------------------------------------------------------------
// checksum.ts — streaming SHA-256 of a delivered part, recorded in the manifest
// so the licensee can verify their sync (each part hashed before it's uploaded
// and deleted).
// ---------------------------------------------------------------------------

import { createHash } from 'crypto'
import { createReadStream } from 'fs'

export function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject)
  })
}

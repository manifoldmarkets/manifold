// ---------------------------------------------------------------------------
// manifest.ts — the per-delivery manifest.json.
//
// Row counts per table, snapshot timestamp, filter definitions, schema version,
// and the product-segment tag per table (so a future subset license is a
// manifest filter, not a re-architecture). Also carries the scrub statistics.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'fs'
import { join } from 'path'
import {
  SCHEMA_VERSION,
  SEGMENT_LABEL,
  TABLES,
  TableName,
  CONTRACT_FILTER_DEF,
} from './scope'
import { RedactStats } from './redact'
import { WriterTotals } from './writer'
import { ReconResult } from './reconstruct'

export interface FileMeta {
  name: string
  bytes: number
  sha256: string
}

export interface Manifest {
  clientId: string
  deliveryDate: string
  snapshotTime: string
  schemaVersion: string
  saltFingerprint: string // sha256 of the salt — proves which salt made this delivery, without revealing it
  // Where this delivery lives. One bucket per licensee is the access boundary
  // (R2 tokens scope to buckets, not prefixes), so the key path carries no client id.
  delivery: { bucket: string; prefix: string }
  filter: typeof CONTRACT_FILTER_DEF
  segments: Record<string, { label: string; tables: string[] }>
  tables: Record<
    string,
    { segment: string; rowCount: number; bytes: number; parts: number; files: FileMeta[] }
  >
  scrubStats: RedactStats
  checks: { probabilityReconstruction: ReconResult }
}

export function buildManifest(args: {
  clientId: string
  deliveryDate: string
  snapshotTime: string
  saltFingerprint: string
  delivery: { bucket: string; prefix: string }
  writes: { table: TableName; totals: WriterTotals; files: FileMeta[] }[]
  scrubStats: RedactStats
  recon: ReconResult
}): Manifest {
  const segments: Manifest['segments'] = {}
  const tables: Manifest['tables'] = {}

  for (const { table, totals, files } of args.writes) {
    const spec = TABLES[table]
    const seg = spec.segment
    segments[seg] ??= { label: SEGMENT_LABEL[seg], tables: [] }
    segments[seg].tables.push(table)
    tables[table] = {
      segment: seg,
      rowCount: totals.totalRows,
      bytes: totals.totalBytes,
      parts: totals.parts,
      files,
    }
  }

  return {
    clientId: args.clientId,
    deliveryDate: args.deliveryDate,
    snapshotTime: args.snapshotTime,
    schemaVersion: SCHEMA_VERSION,
    saltFingerprint: args.saltFingerprint,
    delivery: args.delivery,
    filter: CONTRACT_FILTER_DEF,
    segments,
    tables,
    scrubStats: args.scrubStats,
    checks: { probabilityReconstruction: args.recon },
  }
}

export function writeManifest(outDir: string, manifest: Manifest): string {
  const path = join(outDir, 'manifest.json')
  writeFileSync(path, JSON.stringify(manifest, null, 2))
  return path
}

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

export interface TableMeta {
  segment: string
  rowCount: number
  bytes: number
  parts: number
  files: FileMeta[]
  // Set only when this table came from a later supplemental run and so was read
  // at a different snapshot than the delivery's top-level snapshotTime.
  snapshotTime?: string
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
  tables: Record<string, TableMeta>
  scrubStats: RedactStats
  checks: { probabilityReconstruction: ReconResult }
  // Appended by each supplemental (ONLY_TABLES) run. The top-level scrubStats
  // and checks always describe the ORIGINAL full run; a supplemental run's own
  // stats are recorded here rather than summed into them, so the original
  // attestation stays exactly what it was.
  supplementalRuns?: {
    snapshotTime: string
    tables: string[]
    scrubStats: RedactStats
  }[]
}

/**
 * Merge a supplemental run's manifest into the delivery's existing one: the
 * new run's tables win, every other table is preserved untouched.
 *
 * Pseudonyms are HMACs of a per-client salt, so a merge is only sound if both
 * runs used the SAME salt — otherwise the new table's ids would not join
 * against the delivered ones, which is exactly the silent corruption this
 * whole file exists to prevent. Hence the hard guards.
 */
export function mergeManifest(base: Manifest, next: Manifest): Manifest {
  if (base.saltFingerprint !== next.saltFingerprint) {
    throw new Error(
      `refusing to merge: salt fingerprint differs (delivery ${base.saltFingerprint}, ` +
        `this run ${next.saltFingerprint}). Pseudonyms would not join.`
    )
  }
  if (base.deliveryDate !== next.deliveryDate) {
    throw new Error(
      `refusing to merge: deliveryDate differs (${base.deliveryDate} vs ${next.deliveryDate})`
    )
  }
  if (base.schemaVersion !== next.schemaVersion) {
    throw new Error(
      `refusing to merge: schemaVersion differs (${base.schemaVersion} vs ${next.schemaVersion})`
    )
  }

  const tables: Record<string, TableMeta> = { ...base.tables }
  for (const [name, entry] of Object.entries(next.tables)) {
    tables[name] =
      next.snapshotTime === base.snapshotTime
        ? entry
        : { ...entry, snapshotTime: next.snapshotTime }
  }

  const segments: Manifest['segments'] = {}
  for (const [seg, info] of Object.entries({ ...base.segments, ...next.segments })) {
    const names = new Set([
      ...(base.segments[seg]?.tables ?? []),
      ...(next.segments[seg]?.tables ?? []),
    ])
    segments[seg] = { label: info.label, tables: [...names] }
  }

  return {
    ...base, // top-level scrubStats + checks stay the ORIGINAL run's
    tables,
    segments,
    supplementalRuns: [
      ...(base.supplementalRuns ?? []),
      {
        snapshotTime: next.snapshotTime,
        tables: Object.keys(next.tables),
        scrubStats: next.scrubStats,
      },
    ],
  }
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

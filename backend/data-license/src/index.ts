// ---------------------------------------------------------------------------
// index.ts — orchestrates one delivery. Same entrypoint locally and in Cloud Run.
//
//   config -> snapshot -> (per table: stream -> redact -> chunk -> scan -> upload)
//          -> manifest -> done
//
// Everything runs inside ONE REPEATABLE READ snapshot. Each table is streamed
// through a server-side cursor (never buffered whole), redacted row-by-row, and
// written in ~fixed-size Parquet parts. Every part is scanned before upload and
// deleted after, so peak local disk is ~one part.
//
// Run locally:  set -a; . ./.env; set +a; yarn --cwd backend/data-license dev
// ---------------------------------------------------------------------------

import { createHash } from 'crypto'
import { rmSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { Writable } from 'stream'
import QueryStream from 'pg-query-stream'
import { bootstrapSecrets } from './bootstrap'
import { loadConfig } from './config'
import { connect, withSnapshot, shutdown } from './db'
import {
  setupScopeTable,
  loadDeletedUserIds,
  loadAllUserIds,
  loadDeliveredContractIds,
  pickProbeContracts,
  streamSql,
} from './extract'
import { reconstructPaths, ProbePoint, ReconResult } from './reconstruct'
import { Pseudonymizer } from './pseudonymize'
import { RedactContext, REDACTORS, newStats, Row } from './redact'
import { ChunkedParquetWriter, OnBatch, OnChunk, WriterTotals } from './writer'
import {
  scanBatch,
  emptyCounts,
  addCounts,
  chunkFailed,
  ScanCounts,
} from './validate'
import { makeUploader } from './r2'
import { buildManifest, writeManifest, FileMeta } from './manifest'
import { buildDeliveryReadme } from './delivery-readme'
import { fileSha256 } from './checksum'
import { ALL_TABLES, COLUMN_TYPES, TableName } from './scope'

// How many markets the probability-reconstruction spot check probes. Odd, so
// "strict majority" is unambiguous; see reconstruct.ts for why it isn't 1.
const PROBE_MARKETS = 5

async function main() {
  const started = Date.now()
  await bootstrapSecrets()
  const cfg = await loadConfig()

  const outDir = join(cfg.localOutDir, cfg.clientId, cfg.deliveryDate)
  // One bucket per licensee is the access boundary, so the key path carries no
  // client id — just the (optionally dry-run) delivery date.
  const keyPrefix = cfg.dryRun ? `_dryrun/${cfg.deliveryDate}` : cfg.deliveryDate

  const ps = new Pseudonymizer(cfg.salt, cfg.pseudonymPrefix, cfg.pseudonymHexLen)
  const stats = newStats()
  const uploader = makeUploader(cfg)

  const db = connect()
  let snapshotTime = ''
  const perTable: { table: TableName; totals: WriterTotals; files: FileMeta[] }[] = []
  const scanByTable: Record<string, ScanCounts> = {}
  // probability-reconstruction spot check: capture several markets' bets as they
  // stream. Holder object (not a bare `let`) so the value survives narrowing
  // across the snapshot callback where it's assigned.
  const probe: { markets: { id: string; resolution: string }[] } = { markets: [] }
  const probePoints = new Map<string, ProbePoint[]>()

  try {
    await withSnapshot(db, async (t, snapTime) => {
      snapshotTime = snapTime

      const scopeCount = await setupScopeTable(t, cfg.subsetLimit)
      console.log(`in-scope contracts: ${scopeCount}`)

      const deletedUserIds = await loadDeletedUserIds(t)
      // Always loaded: redaction's raw-id sweep needs it, not just the scan.
      // LEAK_SCAN_FULL now only controls whether the VALIDATOR checks against it.
      const allUserIds = await loadAllUserIds(t)
      const deliveredContractIds = await loadDeliveredContractIds(t)
      probe.markets = await pickProbeContracts(t, PROBE_MARKETS)
      for (const m of probe.markets) probePoints.set(m.id, [])
      console.log(
        `deleted accounts: ${deletedUserIds.size}; leak-scan user ids: ${allUserIds.size}` +
          `; probe markets: ${
            probe.markets.map((m) => `${m.id} (${m.resolution})`).join(', ') || 'none in scope'
          }`
      )

      const ctx: RedactContext = {
        ps,
        stats,
        deletedUserIds,
        deletedAccountMode: cfg.deletedAccountMode,
        knownUserIds: allUserIds,
        scopedContractIds: deliveredContractIds,
      }
      const scanArgs = {
        deliveredContractIds,
        allUserIds: cfg.leakScanFull ? allUserIds : new Set<string>(),
        forbiddenStrings: cfg.forbiddenStrings,
      }

      // Self-test the leak scan: plant a real raw user id in a fake row and
      // assert it's caught. A validator that can't fail is worse than none —
      // this makes a tokenizer/regex regression abort the run at startup.
      if (scanArgs.allUserIds.size > 0) {
        const canary = scanArgs.allUserIds.values().next().value as string
        const st = scanBatch('contracts', [{ id: 'selftest', data: { question: canary } }], scanArgs)
        if (st.rawIdLeaks === 0) {
          throw new Error('leak-scan self-test FAILED: planted raw user id was not detected')
        }
      }

      for (const spec of ALL_TABLES) {
        if (!cfg.segments.includes(spec.segment)) continue
        const table = spec.name
        const redactor = REDACTORS[table]
        const running = emptyCounts()
        scanByTable[table] = running
        const files: FileMeta[] = []

        // The gate: runs on every batch of redacted rows BEFORE they are staged,
        // so nothing that fails is ever written to disk, let alone uploaded.
        const onBatch: OnBatch = async (rows, partPath) => {
          const counts = scanBatch(table, rows, scanArgs)
          addCounts(running, counts)
          if (chunkFailed(counts)) {
            throw new Error(
              `VALIDATION FAILED on ${basename(partPath)}: ${JSON.stringify(counts)}`
            )
          }
        }

        const onChunk: OnChunk = async (chunk) => {
          // hash before upload/delete, so the manifest can attest each part.
          const sha256 = await fileSha256(chunk.path)
          files.push({ name: basename(chunk.path), bytes: chunk.bytes, sha256 })
          if (uploader.enabled) {
            await uploader.upload(chunk.path, `${keyPrefix}/${basename(chunk.path)}`)
            if (!cfg.keepLocalParts) rmSync(chunk.path, { force: true })
          }
        }

        const writer = new ChunkedParquetWriter(table, outDir, {
          maxRows: cfg.chunkRows,
          maxStagedBytes: cfg.chunkBytes,
          columnTypes: COLUMN_TYPES,
          onBatch,
          onChunk,
        })

        // Stream rows through a Writable so the DB cursor applies backpressure
        // while we redact + flush + upload each part.
        const sink = new Writable({
          objectMode: true,
          highWaterMark: 1000,
          write(row: Row, _enc, cb) {
            stats.rowsIn++
            let out: Row | null
            try {
              out = redactor(row, ctx)
            } catch (e) {
              return cb(e as Error)
            }
            if (!out) return cb()
            stats.rowsOut++
            // capture the probe markets' bets from the same rows we deliver
            if (table === 'contract_bets') {
              const pts = probePoints.get(String(out.contract_id))
              if (pts) {
                pts.push({
                  createdTime: Number(out.data?.createdTime),
                  probBefore: Number(out.data?.probBefore),
                  probAfter: Number(out.data?.probAfter),
                  isRedemption: out.data?.isRedemption,
                })
              }
            }
            writer.add(out).then(() => cb(), cb)
          },
        })

        const qs = new QueryStream(streamSql(table), [], { batchSize: 5000 })
        await new Promise<void>((resolve, reject) => {
          sink.on('finish', resolve)
          sink.on('error', reject)
          t.stream(qs, (s) => {
            s.on('error', reject)
            s.pipe(sink)
          }).catch(reject)
        })

        const totals = await writer.close()
        perTable.push({ table, totals, files })
        console.log(
          `  ${table}: ${totals.totalRows} rows, ${totals.parts} part(s), ${(
            totals.totalBytes / 1e6
          ).toFixed(1)} MB`
        )
        // An empty table writes no file at all, so a query that silently
        // matches nothing (wrong column, renamed flag) ships a table the
        // delivery promises and the licensee never receives. Legitimately
        // empty on dev/subset runs, so this warns rather than aborts — but it
        // must be loud enough to catch in the run log.
        if (totals.totalRows === 0) {
          console.warn(`  WARNING: ${table} produced 0 rows — no file is written for it`)
        }
      }
    })
  } finally {
    shutdown()
  }

  // If we got here, every chunk passed validation (a failure throws above).
  const recon: ReconResult = probe.markets.length
    ? reconstructPaths(probe.markets, probePoints)
    : { ran: false, note: 'no resolved binary market in scope' }
  if (recon.ran && !recon.ok) {
    console.error('\nPROBABILITY RECONSTRUCTION FAILED:', JSON.stringify(recon, null, 2))
    process.exit(1)
  }

  const saltFingerprint = createHash('sha256').update(cfg.salt).digest('hex').slice(0, 16)
  const manifest = buildManifest({
    clientId: cfg.clientId,
    deliveryDate: cfg.deliveryDate,
    snapshotTime,
    saltFingerprint,
    delivery: { bucket: cfg.r2.bucket, prefix: keyPrefix },
    writes: perTable,
    scrubStats: stats,
    recon,
  })
  const manifestPath = writeManifest(outDir, manifest)
  const readmePath = join(outDir, 'README.md')
  writeFileSync(readmePath, buildDeliveryReadme(manifest))
  if (uploader.enabled) {
    // README first, then manifest LAST => manifest presence marks a complete,
    // validated delivery.
    await uploader.upload(readmePath, `${keyPrefix}/README.md`)
    await uploader.upload(manifestPath, `${keyPrefix}/manifest.json`)
  }

  const runtimeS = ((Date.now() - started) / 1000).toFixed(1)
  console.log('\n=== shape report ===')
  console.log(JSON.stringify({ manifest, validation: scanByTable, runtimeS }, null, 2))
  console.log(
    `\n${uploader.enabled ? `Uploaded to r2://${cfg.r2.bucket}/${keyPrefix}/` : `Local only: ${outDir}`}` +
      `${cfg.dryRun ? ' (dry run)' : ''}`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

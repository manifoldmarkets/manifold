// ---------------------------------------------------------------------------
// writer.ts — streams redacted rows to zstd Parquet in ~fixed-size parts.
//
// Rows are staged incrementally to a newline-delimited JSON file and flushed as
// one Parquet part via DuckDB (the jsonb `data` blob becomes a JSON string
// column so the schema is stable across rows). After each part the onChunk hook
// runs (upload -> delete), so peak local disk is ~one part, not the whole table
// — which is what keeps this inside Cloud Run's small ephemeral disk.
//
// NOTHING is held whole in memory: rows are serialized and appended to the
// staging file in small batches (BATCH_ROWS), and only that batch is resident.
// Buffering a whole part in JS was how this first blew up — a table under
// maxRows but over ~512MB of JSON hits V8's max string length in `join('\n')`.
//
// A part is cut on EITHER maxRows or maxStagedBytes, whichever trips first, so
// wide-blob tables (contracts) and narrow ones (bets) both land near the target
// part size instead of only rows being counted.
//
// onBatch is the validation gate: it runs on each batch BEFORE those rows are
// staged, so a throw aborts the run with nothing written or uploaded.
// ---------------------------------------------------------------------------

import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import { createWriteStream, mkdirSync, statSync, rmSync, WriteStream } from 'fs'
import { once } from 'events'
import { join } from 'path'
import { tmpdir } from 'os'
import { Row } from './redact'

export interface ChunkResult {
  path: string
  part: number
  rowCount: number
  bytes: number
}

/** Scan hook, run on each batch before it is staged. Throwing aborts the run. */
export type OnBatch = (rows: Row[], partPath: string) => Promise<void>
/** Post-write hook for a finished part (hash -> upload -> delete). */
export type OnChunk = (chunk: ChunkResult) => Promise<void>

export interface WriterTotals {
  totalRows: number
  totalBytes: number
  parts: number
}

export interface WriterOptions {
  maxRows: number
  /** Staged NDJSON bytes per part. The Parquet part is several times smaller. */
  maxStagedBytes: number
  /**
   * DuckDB type overrides by column NAME (scope.ts COLUMN_TYPES). pg serializes
   * numerics and timestamps as strings, so without this those columns would be
   * inferred (and delivered) as VARCHAR. Applied on top of the inferred schema;
   * a value that can't cast fails the COPY and aborts the run.
   */
  columnTypes?: Record<string, string>
  onBatch?: OnBatch
  onChunk?: OnChunk
}

// Rows held in memory at once (serialization + the scan gate). Small enough
// that peak heap is a few MB of rows regardless of part size.
const BATCH_ROWS = 2000

// pg timestamptz columns arrive as JS Dates, and Date#toISOString serializes
// years outside 1–9999 in ISO's extended '+/-YYYYYY' form ("+010000-01-01…"),
// which DuckDB's timestamp parser rejects — and prod really does carry year-
// 10000+ close times ("never closes"). Clamp to the basic ISO range; the
// clamped count is logged per table so a delivery review can eyeball it.
const TS_MAX_MS = 253402300799999 // 9999-12-31T23:59:59.999Z
const TS_MIN_MS = -62135596800000 // 0001-01-01T00:00:00.000Z
const TS_MAX_ISO = '9999-12-31T23:59:59.999Z'
const TS_MIN_ISO = '0001-01-01T00:00:00.000Z'

export class ChunkedParquetWriter {
  private batch: Row[] = []
  private part = 0
  private totalRows = 0
  private totalBytes = 0
  private clampedTimestamps = 0
  private connPromise: Promise<DuckDBConnection> | undefined
  // Open staging file for the part being accumulated (created lazily, so a
  // table with zero rows writes no file at all).
  private staging: { path: string; stream: WriteStream } | undefined
  private partRows = 0
  private partBytes = 0
  // Schema captured from the first part and pinned for every later part, so an
  // all-null column in one part can't be inferred to a different Parquet type
  // than its siblings (which would break read_parquet('t.*.parquet') for the
  // client). Top-level keys are fixed by the pg column list, so pinning types
  // is sufficient.
  private pinnedColumns: string | undefined

  constructor(
    private readonly table: string,
    private readonly outDir: string,
    private readonly opts: WriterOptions
  ) {
    mkdirSync(outDir, { recursive: true })
  }

  private conn(): Promise<DuckDBConnection> {
    return (this.connPromise ??= DuckDBInstance.create(':memory:').then((i) => i.connect()))
  }

  async add(row: Row): Promise<void> {
    this.batch.push(row)
    if (this.batch.length >= BATCH_ROWS) await this.stageBatch()
    if (this.partRows >= this.opts.maxRows || this.partBytes >= this.opts.maxStagedBytes) {
      await this.flush()
    }
  }

  async close(): Promise<WriterTotals> {
    await this.stageBatch()
    if (this.partRows) await this.flush()
    if (this.clampedTimestamps) {
      console.log(
        `  ${this.table}: clamped ${this.clampedTimestamps} out-of-range timestamp value(s) to [0001, 9999]`
      )
    }
    // An empty table writes NO file (a zero-row Parquet would need the real
    // column schema, which we only learn from rows); the manifest records
    // rowCount 0 / parts 0 for it.
    return { totalRows: this.totalRows, totalBytes: this.totalBytes, parts: this.part }
  }

  private partPath(part: number): string {
    return join(this.outDir, `${this.table}.${String(part).padStart(4, '0')}.parquet`)
  }

  private isTimestampColumn(name: string): boolean {
    const t = this.opts.columnTypes?.[name]
    return !!t && t.toUpperCase().startsWith('TIMESTAMP')
  }

  private stageRow(row: Row): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      if (k === 'data' && v != null && typeof v === 'object') {
        out[k] = JSON.stringify(v)
      } else if (v instanceof Date && this.isTimestampColumn(k)) {
        const ms = v.getTime()
        if (ms > TS_MAX_MS) {
          this.clampedTimestamps++
          out[k] = TS_MAX_ISO
        } else if (ms < TS_MIN_MS) {
          this.clampedTimestamps++
          out[k] = TS_MIN_ISO
        } else {
          out[k] = v
        }
      } else {
        out[k] = v
      }
    }
    return out
  }

  /** Scan the pending batch, then append it to the current staging file. */
  private async stageBatch(): Promise<void> {
    if (!this.batch.length) return
    const rows = this.batch
    this.batch = []

    const outPath = this.partPath(this.part)
    // Gate first: a validation failure must leave nothing staged or uploaded.
    if (this.opts.onBatch) await this.opts.onBatch(rows, outPath)

    this.staging ??= (() => {
      const path = join(tmpdir(), `dl-${this.table}-${this.part}-${process.pid}.ndjson`)
      return { path, stream: createWriteStream(path) }
    })()

    // One string per batch (~a few MB), never per part — see the header note.
    const text = rows.map((r) => JSON.stringify(this.stageRow(r))).join('\n') + '\n'
    this.partRows += rows.length
    this.partBytes += Buffer.byteLength(text)
    if (!this.staging.stream.write(text)) await once(this.staging.stream, 'drain')
  }

  /** Convert the staged NDJSON into one Parquet part and hand it to onChunk. */
  private async flush(): Promise<void> {
    await this.stageBatch()
    const staged = this.staging
    if (!staged || !this.partRows) return
    this.staging = undefined
    const rowCount = this.partRows
    this.partRows = 0
    this.partBytes = 0
    const part = this.part++
    const outPath = this.partPath(part)

    staged.stream.end()
    await once(staged.stream, 'close')
    try {
      const conn = await this.conn()
      if (!this.pinnedColumns) {
        // Infer once from the first part, then pin for all parts (see field doc).
        const desc = await conn.runAndReadAll(
          `DESCRIBE SELECT * FROM read_json('${staged.path}',
             format = 'newline_delimited', union_by_name = true, sample_size = -1)`
        )
        this.pinnedColumns = desc
          .getRows()
          .map(([name, type]) => {
            const t = this.opts.columnTypes?.[String(name)] ?? String(type)
            return `'${name}': '${t.replace(/'/g, "''")}'`
          })
          .join(', ')
      }
      await conn.run(
        `COPY (
           SELECT * FROM read_json('${staged.path}',
             format = 'newline_delimited', sample_size = -1,
             columns = {${this.pinnedColumns}})
         ) TO '${outPath}' (FORMAT parquet, COMPRESSION zstd)`
      )
    } finally {
      rmSync(staged.path, { force: true })
    }

    const bytes = statSync(outPath).size
    this.totalRows += rowCount
    this.totalBytes += bytes
    if (this.opts.onChunk) await this.opts.onChunk({ path: outPath, part, rowCount, bytes })
  }
}

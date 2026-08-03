// ---------------------------------------------------------------------------
// config.ts — all runtime configuration, read from process.env.
//
// Nothing here (or anywhere in the code) names a client or knows how many
// clients exist: the job runs exactly one delivery per invocation, fully
// parameterized by env. The salt and the forbidden-strings denylist are
// resolved from Secret Manager by *runtime-supplied resource names*, so a
// client is never identifiable from the repo.
// ---------------------------------------------------------------------------

import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { Segment, TABLES, TableName } from './scope'

export interface Config {
  clientId: string
  deliveryDate: string // YYYY-MM-DD
  salt: Buffer
  pseudonymPrefix: string
  pseudonymHexLen: number
  deletedAccountMode: 'remove' | 'redact'
  subsetLimit: number | undefined
  dryRun: boolean
  localOutDir: string
  chunkRows: number
  chunkBytes: number
  leakScanFull: boolean
  keepLocalParts: boolean
  segments: Segment[]
  // Restrict the run to these tables (a "supplemental" run that repairs or adds
  // one table to an existing delivery). When set, the manifest is MERGED into
  // the delivery's existing manifest instead of replacing it — see index.ts.
  onlyTables: TableName[] | undefined
  forbiddenStrings: string[]
  r2: {
    bucket: string
    endpoint: string | undefined
    accessKeyId: string | undefined
    secretAccessKey: string | undefined
  }
}

function opt(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length ? v : undefined
}

function req(name: string): string {
  const v = opt(name)
  if (!v) throw new Error(`missing required env var: ${name}`)
  return v
}

// A garbage numeric env must fail fast: e.g. CHUNK_ROWS=NaN would make the
// writer's `buffer.length >= maxRows` never fire and buffer a whole table.
function num(name: string, dflt: number): number {
  const v = opt(name)
  if (v === undefined) return dflt
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number, got: ${v}`)
  }
  return n
}

let secretClient: SecretManagerServiceClient | undefined
async function accessSecret(resource: string): Promise<string> {
  secretClient ??= new SecretManagerServiceClient()
  const [res] = await secretClient.accessSecretVersion({ name: resource })
  const payload = res.payload?.data
  if (!payload) throw new Error(`secret ${resource} has empty payload`)
  return Buffer.from(payload).toString('utf8')
}

async function resolveSalt(): Promise<Buffer> {
  const literal = opt('EXPORT_SALT')
  const resource = opt('SALT_SECRET_RESOURCE')
  if (literal && resource) {
    throw new Error('set EXACTLY ONE of EXPORT_SALT / SALT_SECRET_RESOURCE')
  }
  if (literal) return Buffer.from(literal, 'utf8')
  if (resource) return Buffer.from(await accessSecret(resource), 'utf8')
  throw new Error('no salt: set EXPORT_SALT (local) or SALT_SECRET_RESOURCE (cloud)')
}

async function resolveForbiddenStrings(): Promise<string[]> {
  const parts: string[] = []
  const literal = opt('FORBIDDEN_STRINGS')
  if (literal) parts.push(...literal.split(','))
  const resource = opt('FORBIDDEN_STRINGS_SECRET_RESOURCE')
  if (resource) parts.push(...(await accessSecret(resource)).split(','))
  // lowercased here; the validator lowercases each row blob to match, so
  // "betty mctestface" in a comment still trips a "Betty McTestface" entry.
  return parts
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function loadConfig(): Promise<Config> {
  const segments = (opt('SEGMENTS') ?? 'A,B,C')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Segment => s === 'A' || s === 'B' || s === 'C')

  // redact (not remove): removing a deleted-author comment would orphan its
  // child replies (replyToCommentId). Redact keeps the thread structure intact.
  const mode = (opt('DELETED_ACCOUNT_MODE') ?? 'redact') as 'remove' | 'redact'
  if (mode !== 'remove' && mode !== 'redact') {
    throw new Error(`DELETED_ACCOUNT_MODE must be remove|redact, got ${mode}`)
  }

  // Unknown names must fail fast: a typo would otherwise run ZERO tables and
  // then "merge" an empty result over a good delivery manifest.
  const onlyTables = (() => {
    const raw = opt('ONLY_TABLES')
    if (!raw) return undefined
    const names = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
    const bad = names.filter((n) => !(n in TABLES))
    if (bad.length) {
      throw new Error(
        `ONLY_TABLES has unknown table(s): ${bad.join(', ')}. Valid: ${Object.keys(TABLES).join(', ')}`
      )
    }
    if (!names.length) throw new Error('ONLY_TABLES is set but empty')
    return names as TableName[]
  })()

  return {
    clientId: req('CLIENT_ID'),
    deliveryDate: opt('DELIVERY_DATE') ?? today(),
    salt: await resolveSalt(),
    pseudonymPrefix: opt('PSEUDONYM_PREFIX') ?? 'User_',
    pseudonymHexLen: num('PSEUDONYM_HEX_LEN', 20),
    deletedAccountMode: mode,
    subsetLimit: opt('SUBSET_LIMIT') ? num('SUBSET_LIMIT', 0) : undefined,
    dryRun: (opt('DRY_RUN') ?? 'true') !== 'false',
    localOutDir: opt('LOCAL_OUT_DIR') ?? './out',
    chunkRows: num('CHUNK_ROWS', 250000),
    // Second cut for a part, on staged NDJSON bytes: rows alone are a bad proxy
    // when blobs are wide (contracts average ~3KB, so 250k rows is >700MB of
    // JSON). The Parquet part lands several times smaller than this.
    chunkBytes: num('CHUNK_BYTES', 512_000_000),
    leakScanFull: (opt('LEAK_SCAN_FULL') ?? 'true') !== 'false',
    // keep parts on local disk after upload (default false: delete to bound disk).
    keepLocalParts: (opt('KEEP_LOCAL_PARTS') ?? 'false') === 'true',
    segments,
    onlyTables,
    forbiddenStrings: await resolveForbiddenStrings(),
    r2: {
      bucket: opt('R2_BUCKET') ?? '', // per-client bucket; required when R2 is enabled
      endpoint: opt('R2_ENDPOINT'),
      accessKeyId: opt('R2_ACCESS_KEY_ID'),
      secretAccessKey: opt('R2_SECRET_ACCESS_KEY'),
    },
  }
}

import { log } from './utils'

// The one Solana JSON-RPC call the oracle needs, with endpoint fallback.
//
// Endpoints come from SOLANA_RPC_URLS (comma-separated, tried in order), and
// the public mainnet endpoint is always appended as the last resort. The
// public endpoint is documented as "not intended for production" and limited
// to 100 requests per 10s per IP; the oracle makes ONE batched call per tick
// (30/min, all pools in a single getMultipleAccounts), which is well inside
// that, but a keyed provider URL (Helius/QuickNode free tiers are 10 rps)
// belongs first in the list once one exists. Any node works: the data is
// public chain state and every node returns the same bytes for a slot, so
// the provider is infrastructure, not a data source.
//
// `confirmed` commitment rather than `processed`: one slot (~400ms) behind
// the tip, in exchange for never reading a fork that gets dropped. A 2s poll
// does not notice half a second; a price that never existed would.

export const PUBLIC_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'

export const getSolanaRpcUrls = (): string[] => {
  const configured = (process.env.SOLANA_RPC_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
  return configured.includes(PUBLIC_SOLANA_RPC_URL)
    ? configured
    : [...configured, PUBLIC_SOLANA_RPC_URL]
}

export type SolanaAccount = {
  /** Program that owns the account, base58. */
  owner: string
  data: Uint8Array
}

export type MultipleAccountsResult = {
  slot: number
  /** Same order as the requested addresses; null where no account exists. */
  accounts: (SolanaAccount | null)[]
}

// getMultipleAccounts accepts at most 100 pubkeys per call.
const MAX_ACCOUNTS_PER_CALL = 100

export const getMultipleAccounts = async (
  addresses: readonly string[],
  timeoutMs: number
): Promise<MultipleAccountsResult> => {
  if (addresses.length === 0) return { slot: 0, accounts: [] }
  if (addresses.length > MAX_ACCOUNTS_PER_CALL)
    throw new Error(
      `getMultipleAccounts: ${addresses.length} addresses exceeds the ${MAX_ACCOUNTS_PER_CALL} per-call limit`
    )
  const failures: string[] = []
  for (const url of getSolanaRpcUrls()) {
    try {
      return await requestMultipleAccounts(url, addresses, timeoutMs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      failures.push(`${url}: ${message}`)
      log(`[solana-rpc] ${url} failed — ${message}`)
    }
  }
  throw new Error(
    `getMultipleAccounts failed on every endpoint: ${failures.join('; ')}`
  )
}

const requestMultipleAccounts = async (
  url: string,
  addresses: readonly string[],
  timeoutMs: number
): Promise<MultipleAccountsResult> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getMultipleAccounts',
      params: [addresses, { encoding: 'base64', commitment: 'confirmed' }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return parseMultipleAccounts(await res.json(), addresses.length)
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const parseMultipleAccounts = (
  body: unknown,
  expected: number
): MultipleAccountsResult => {
  const envelope = asRecord(body)
  const error = asRecord(envelope?.error)
  if (error) throw new Error(`rpc error ${error.code}: ${error.message}`)
  const result = asRecord(envelope?.result)
  const slot = asRecord(result?.context)?.slot
  const value = result?.value
  if (typeof slot !== 'number' || !Array.isArray(value))
    throw new Error('malformed getMultipleAccounts response')
  if (value.length !== expected)
    throw new Error(
      `getMultipleAccounts returned ${value.length} accounts for ${expected} addresses`
    )
  const accounts = value.map((entry): SolanaAccount | null => {
    if (entry === null) return null
    const account = asRecord(entry)
    const data = account?.data
    if (
      !account ||
      typeof account.owner !== 'string' ||
      !Array.isArray(data) ||
      typeof data[0] !== 'string' ||
      data[1] !== 'base64'
    )
      throw new Error('malformed account in getMultipleAccounts response')
    return {
      owner: account.owner,
      data: new Uint8Array(Buffer.from(data[0], 'base64')),
    }
  })
  return { slot, accounts }
}

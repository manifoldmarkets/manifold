const MEMPOOL_API = 'https://mempool.space/api'

export interface BitcoinBlock {
  id: string // block hash (64-char hex)
  height: number
  timestamp: number
}

/**
 * Find the first Bitcoin block mined at or after the given Unix timestamp.
 * Uses mempool.space API which has a timestamp lookup endpoint.
 *
 * @param unixTimestampSeconds - Unix timestamp in seconds
 * @returns The first block with timestamp >= the given timestamp
 * @throws Error if the block hasn't been mined yet or API fails
 */
export async function getFirstBlockAfter(
  unixTimestampSeconds: number
): Promise<BitcoinBlock> {
  // Step 1: Get the block at/before the timestamp
  const tsRes = await fetch(
    `${MEMPOOL_API}/v1/mining/blocks/timestamp/${unixTimestampSeconds}`
  )
  if (!tsRes.ok) {
    throw new Error(`Failed to fetch block by timestamp: ${tsRes.statusText}`)
  }
  const blockBefore: { height: number; hash: string; timestamp: string } =
    await tsRes.json()

  // Step 2: Get the next block (first block AFTER our target timestamp)
  const nextHeight = blockBefore.height + 1
  const hashRes = await fetch(`${MEMPOOL_API}/block-height/${nextHeight}`)
  if (!hashRes.ok) {
    throw new Error(`Block ${nextHeight} not yet mined`)
  }
  const nextHash = await hashRes.text()

  // Step 3: Get full block details to confirm timestamp
  const blockRes = await fetch(`${MEMPOOL_API}/block/${nextHash}`)
  if (!blockRes.ok) {
    throw new Error(`Failed to fetch block details: ${blockRes.statusText}`)
  }
  const block: { id: string; height: number; timestamp: number } =
    await blockRes.json()

  return {
    id: block.id,
    height: block.height,
    timestamp: block.timestamp,
  }
}

/**
 * Check if a Bitcoin block exists after the given timestamp.
 * Returns the block info if available, or null if not yet mined.
 *
 * @param unixTimestampSeconds - Unix timestamp in seconds
 * @returns Block info if available, null if not yet mined
 */
export async function checkBlockAfter(
  unixTimestampSeconds: number
): Promise<BitcoinBlock | null> {
  try {
    return await getFirstBlockAfter(unixTimestampSeconds)
  } catch {
    return null
  }
}

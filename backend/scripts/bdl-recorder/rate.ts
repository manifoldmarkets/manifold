import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import type { BdlClock } from 'shared/balldontlie-client'

const wallClock: BdlClock = {
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export const maxPaidRecorderRate = 500

function stateDirectory() {
  const repo = resolve(__dirname, '../../..')
  const worktrees = dirname(repo)
  const build =
    process.env.BDL_BUILD_DIR ??
    (basename(worktrees) === 'wt'
      ? dirname(worktrees)
      : join(homedir(), '.manifold'))
  return resolve(build, '.bdl-recorder-rate-v1')
}

type Slot = { at: number; interval: number }

const codeIs = (e: unknown, code: string) =>
  (e as NodeJS.ErrnoException).code === code

async function readSlot(file: string): Promise<Slot> {
  const slot: Slot = JSON.parse(await fs.readFile(file, 'utf8'))
  if (
    !Number.isSafeInteger(slot?.at) ||
    !Number.isSafeInteger(slot.interval) ||
    slot.interval <= 0
  )
    throw new Error('Invalid BDL recorder rate state in ' + file)
  return slot
}

async function unlinkIfPresent(file: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.unlink(file)
      return
    } catch (e) {
      if (codeIs(e, 'ENOENT')) return
      // On Windows another reader/deleter can briefly hold a delete-pending file.
      if (attempt === 5 || !(codeIs(e, 'EPERM') || codeIs(e, 'EBUSY'))) throw e
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)))
    }
  }
}

/** Hard-link a complete record to a unique sequence number. Only one contender
 * can publish it. The cursor's file size is the committed sequence, using one
 * byte per grant. Positional writes are idempotent: a process can finish an
 * interrupted publication, and a late writer can never decrease the cursor. */
export function createRecorderSlotGate(
  dir: string,
  clock: BdlClock = wallClock
) {
  const counter = join(dir, 'sequence')
  const snapshot = (n: number) => join(dir, 'slot-' + n + '.json')
  return async (rate: number, beforeGrant?: () => void): Promise<void> => {
    const interval = Math.ceil(60_000 / rate)
    if (
      !Number.isFinite(rate) ||
      rate <= 0 ||
      rate > maxPaidRecorderRate ||
      !Number.isSafeInteger(interval)
    )
      throw new Error('Invalid recorder rate.')
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
    await (await fs.open(counter, 'a', 0o600)).close()
    const cursor = await fs.open(counter, 'r+')
    try {
      for (;;) {
        const seq = (await cursor.stat()).size
        const now = clock.now()
        if (!Number.isSafeInteger(now) || now < 0)
          throw new Error('Invalid recorder clock.')
        if (seq > 0) {
          let prior: Slot
          try {
            prior = await readSlot(snapshot(seq))
          } catch (e) {
            // The snapshot can be pruned by a newer committed slot.
            if (
              (codeIs(e, 'ENOENT') || codeIs(e, 'EPERM')) &&
              (await cursor.stat()).size > seq
            )
              continue
            throw e
          }
          const due = prior.at + Math.max(interval, prior.interval)
          if (!Number.isSafeInteger(due))
            throw new Error('Invalid recorder rate deadline.')
          if (now < due) {
            await clock.sleep(Math.min(due - now, 2_147_483_647))
            continue
          }
        }
        const next = seq + 1
        const target = snapshot(next)
        const temp = join(dir, '.pending-' + randomUUID())
        await fs.writeFile(temp, JSON.stringify({ at: now, interval }), {
          flag: 'wx',
          mode: 0o600,
        })
        let won = false
        try {
          beforeGrant?.()
          try {
            await fs.link(temp, target)
            won = true
          } catch (e) {
            if (!codeIs(e, 'EEXIST')) throw e
          }
        } finally {
          await unlinkIfPresent(temp)
        }
        // Publish the winner, including if its own process just exited. Keep
        // the most recent snapshot until a newer sequence is committed.
        await cursor.write(Buffer.from([0]), 0, 1, seq)
        const committed = (await cursor.stat()).size
        if (seq > 0) await unlinkIfPresent(snapshot(seq))
        if (committed > next) {
          // A long-paused caller may have recreated an already retired record.
          await unlinkIfPresent(target)
          continue
        }
        if (won) return
      }
    } finally {
      await cursor.close()
    }
  }
}

export const acquireRecorderSlot = (
  rate: number,
  beforeGrant?: () => void
): Promise<void> => createRecorderSlotGate(stateDirectory())(rate, beforeGrant)

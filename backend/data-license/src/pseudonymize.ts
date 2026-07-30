// ---------------------------------------------------------------------------
// pseudonymize.ts — HMAC-SHA256(user_id, per_client_salt) -> "User_" + hex.
//
// Properties (per the legal requirement):
//  - deterministic per (salt, user_id) => stable across tables AND across months,
//    so per-user track records join for the licensee.
//  - one salt per client, so pseudonyms don't collide or join across clients.
//  - collision-checked: if two distinct raw ids map to the same truncated
//    pseudonym, we lengthen until distinct (or throw).
//
// The map also remembers every raw id it has seen, which the validator uses as
// one input to the "zero raw user ids in output" scan.
// ---------------------------------------------------------------------------

import { createHmac } from 'crypto'

export class Pseudonymizer {
  private readonly forward = new Map<string, string>() // rawId -> pseudonym
  private readonly reverse = new Map<string, string>() // pseudonym -> rawId

  constructor(
    private readonly salt: Buffer,
    private readonly prefix = 'User_',
    private readonly hexLen = 20
  ) {
    if (salt.length === 0) throw new Error('pseudonymizer: empty salt')
  }

  /** Map one raw user id. Passes through null/undefined/'' unchanged. */
  map<T extends string | null | undefined>(rawId: T): T {
    if (!rawId) return rawId
    const cached = this.forward.get(rawId)
    if (cached) return cached as T

    const digest = createHmac('sha256', this.salt).update(rawId).digest('hex')
    let len = this.hexLen
    let pseudonym = this.prefix + digest.slice(0, len)
    // Resolve the (astronomically unlikely) truncation collision deterministically.
    while (this.reverse.has(pseudonym) && this.reverse.get(pseudonym) !== rawId) {
      len += 4
      if (len > digest.length) {
        throw new Error(
          `pseudonymize: unresolvable collision for a user id at full digest length`
        )
      }
      pseudonym = this.prefix + digest.slice(0, len)
    }

    this.forward.set(rawId, pseudonym)
    this.reverse.set(pseudonym, rawId)
    return pseudonym as T
  }

  /** Every raw user id mapped so far — an input to the leak scan. */
  rawIds(): Iterable<string> {
    return this.forward.keys()
  }

  get size(): number {
    return this.forward.size
  }
}

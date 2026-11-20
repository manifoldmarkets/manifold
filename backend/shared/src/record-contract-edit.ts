import { APIError } from 'common/api/utils'
import { Contract } from 'common/contract'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'

export const recordContractEdit = async (
  contract: Contract,
  editorId: string,
  updatedKeys: string[],
  // Names what the edit records, for a reader that needs this edit and no
  // other (getResolutionEditKey).
  idempotencyKey?: string,
  // A transaction to record it in, where the edit has to exist exactly when
  // the change it records does.
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  // A key names one edit. A second resolution of the same answer or market in
  // the same millisecond would record the same key as the first, and
  // unresolving it could not tell their edits apart. It fails instead, and is
  // made again a moment later under another key.
  if (idempotencyKey !== undefined) {
    const taken = await pg.oneOrNone(
      `select 1 from contract_edits
      where contract_id = $1 and idempotency_key = $2
      limit 1`,
      [contract.id, idempotencyKey]
    )
    if (taken)
      throw new APIError(
        409,
        'This was resolved at the same moment as an earlier resolution. Please try again.'
      )
  }
  await pg.none(
    `insert into contract_edits
            (contract_id, editor_id, data, updated_keys, idempotency_key)
            values ($1, $2, $3, $4, $5)
            on conflict do nothing`,
    [contract.id, editorId, contract, updatedKeys, idempotencyKey ?? null]
  )
}

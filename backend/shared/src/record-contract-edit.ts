import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const recordContractEdit = async (
  contract: Contract,
  editorId: string,
  updatedKeys: string[],
  // Names what the edit records, for a reader that needs this edit and no
  // other (getResolutionEditKey).
  idempotencyKey?: string
) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `insert into contract_edits
            (contract_id, editor_id, data, updated_keys, idempotency_key)
            values ($1, $2, $3, $4, $5)
            on conflict do nothing`,
    [contract.id, editorId, contract, updatedKeys, idempotencyKey ?? null]
  )
}

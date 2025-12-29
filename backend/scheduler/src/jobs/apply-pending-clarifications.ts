import { applyClarificationToContract } from 'shared/apply-clarification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract, log } from 'shared/utils'

export async function applyPendingClarifications() {
  const pg = createSupabaseDirectClient()

  // Get pending clarifications older than 1 hour
  const pendingClarifications = await pg.manyOrNone<{
    id: number
    contract_id: string
    comment_id: string
    data: { markdown: string }
  }>(
    `select id, contract_id, comment_id, data
     from pending_clarifications
     where applied_time is null
       and cancelled_time is null
       and created_time < now() - interval '1 hour'
     order by created_time asc
     limit 500`,
    []
  )

  if (pendingClarifications.length === 0) {
    return
  }

  log(
    `Found ${pendingClarifications.length} pending clarifications to auto-apply`
  )

  for (const clarification of pendingClarifications) {
    try {
      const contract = await getContract(pg, clarification.contract_id)
      if (!contract) {
        log.error(`Contract not found for clarification ${clarification.id}`)
        // Mark as cancelled since contract doesn't exist
        await pg.none(
          `update pending_clarifications
           set cancelled_time = now()
           where id = $1`,
          [clarification.id]
        )
        continue
      }

      // Apply the clarification
      await applyClarificationToContract(
        pg,
        contract,
        clarification.comment_id,
        clarification.data.markdown
      )

      // Mark as applied
      await pg.none(
        `update pending_clarifications
         set applied_time = now()
         where id = $1`,
        [clarification.id]
      )

      log(
        `Auto-applied clarification ${clarification.id} to contract ${contract.slug}`
      )
    } catch (e) {
      log.error(`Error auto-applying clarification ${clarification.id}:`, { e })
    }
  }
}

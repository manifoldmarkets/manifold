import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log, revalidateContractStaticProps } from 'shared/utils'
import { type APIHandler } from './helpers/endpoint'

export const deleteSpamComments: APIHandler<'delete-spam-comments'> = async (
  { commentIds },
  auth
) => {
  throwErrorIfNotMod(auth.uid)

  if (commentIds.length === 0) {
    return { success: true, deletedCount: 0 }
  }

  const pg = createSupabaseDirectClient()

  // Get contract info for revalidation before deleting
  const affectedContracts = await pg.manyOrNone<{
    slug: string
    creatorUsername: string
  }>(
    `select distinct c.slug, c.data->>'creatorUsername' as "creatorUsername"
     from contract_comments cc
     join contracts c on c.id = cc.contract_id
     where cc.comment_id = any($1)`,
    [commentIds]
  )

  // Delete comments
  const now = Date.now()
  await pg.none(
    `update contract_comments
     set data = data
       || jsonb_build_object('deleted', true)
       || jsonb_build_object('deletedTime', to_jsonb($2::bigint))
       || jsonb_build_object('deleterId', to_jsonb($3::text))
     where comment_id = any($1)`,
    [commentIds, now, auth.uid]
  )

  log(`Deleted ${commentIds.length} spam comments.`)

  // Revalidate affected contracts (don't await, do in background)
  return {
    success: true,
    deletedCount: commentIds.length,
    continue: async () => {
      for (const contract of affectedContracts) {
        try {
          await revalidateContractStaticProps(contract)
        } catch (e) {
          log.error(
            `Error revalidating ${contract.creatorUsername}/${contract.slug}: ${e}`
          )
        }
      }
      log(`Revalidated ${affectedContracts.length} contracts.`)
    },
  }
}

import { run, SupabaseClient } from 'common/supabase/utils'

export async function getInvite(inviteId: string, db: SupabaseClient) {
  const { data: invite } = await run(
    db.from('group_invites').select('*').eq('id', inviteId).limit(1)
  )

  if (invite && invite.length > 0) {
    const inv = invite[0]
    return {
      ...inv,
      created_time: new Date(inv.created_time),
      expire_time: inv.expire_time ? new Date(inv.expire_time) : null,
    }
  }
  return null
}

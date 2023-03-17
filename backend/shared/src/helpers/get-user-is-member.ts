import { ITask } from 'pg-promise'
import { SupabaseDirectClient } from 'shared/supabase/init'

// checks if user is member
export async function getUserIsMember(
  pg: SupabaseDirectClient | ITask<any>,
  groupId: string,
  userId: string
) {
  return (
    await pg.one(
      'select exists( select * from group_role where group_id = $1 and member_id=$2 )',
      [groupId, userId]
    )
  ).exists
}

import { createSupabaseClient } from 'shared/supabase/init'
import { tryOrLogError } from 'shared/helpers/try-or-log-error'
import { run } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'

export const trackAuditEvent = async (
  userId: string,
  name: string,
  contractId?: string,
  commentId?: string,
  otherProps?: Record<string, any>
) => {
  const db = createSupabaseClient()
  return await tryOrLogError(
    run(
      db.from('audit_events').insert(
        removeUndefinedProps({
          name,
          user_id: userId,
          contract_id: contractId,
          comment_id: commentId,
          data: otherProps,
        })
      )
    )
  )
}

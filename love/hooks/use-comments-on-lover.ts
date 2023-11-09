import { convertSQLtoTS, Row, tsToMillis } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { LoverComment } from 'common/love/love-comment'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { maxBy } from 'lodash'

export function useRealtimeCommentsOnLover(userId: string) {
  const q = db.from('lover_comments').select('*').eq('on_user_id', userId)
  const newRowsOnlyQ = (rows: Row<'lover_comments'>[] | undefined) =>
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    db
      .from('lover_comments')
      .select('*')
      .eq('on_user_id', userId)
      .gt('id', maxBy(rows, 'id')?.id ?? 0)

  const res = usePersistentSupabasePolling(
    q,
    newRowsOnlyQ,
    `comments-on-lover-${userId}`,
    {
      ms: 500,
      deps: [userId],
      shouldUseLocalStorage: true,
    }
  )

  return res?.data?.map((r) =>
    convertSQLtoTS<'lover_comments', LoverComment>(r, {
      created_time: tsToMillis as any,
    })
  )
}

import { convertSQLtoTS, Row, tsToMillis } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { LoverComment } from 'common/love/love-comment'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { maxBy } from 'lodash'
import { PostgrestBuilder } from '@supabase/postgrest-js'

export function useRealtimeCommentsOnLover(userId: string) {
  const q = db
    .from('lover_comments')
    .select('*')
    .eq('on_user_id', userId) as PostgrestBuilder<'lover_comments'>
  const newRowsOnlyQ = (rows: Row<'lover_comments'>[] | undefined) =>
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    db
      .from('lover_comments')
      .select('*')
      .eq('on_user_id', userId)
      .gt(
        'id',
        maxBy(rows, 'id')?.id ?? 0
      ) as PostgrestBuilder<'lover_comments'>

  const res = usePersistentSupabasePolling(
    'lover_comments',
    q,
    newRowsOnlyQ,
    `comments-on-lover-${userId}-v1`,
    {
      ms: 500,
      deps: [userId],
      shouldUseLocalStorage: true,
    }
  )

  return res?.map((r) =>
    convertSQLtoTS<'lover_comments', LoverComment>(r, {
      created_time: tsToMillis as any,
    })
  )
}

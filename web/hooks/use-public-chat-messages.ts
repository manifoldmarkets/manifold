import { db } from 'web/lib/supabase/db'
import { Row } from 'common/supabase/utils'
import { maxBy, orderBy } from 'lodash'
import { usePersistentSupabasePolling } from 'web/hooks/use-persistent-supabase-polling'
import { convertPublicChatMessage } from 'common/chat-message'

export function useRealtimePublicMessagesPolling(
  channelId: string,
  ms: number,
  initialLimit = 100,
  ignoreSystemStatus = false
) {
  let allRowsQ = db
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_time', { ascending: false })
    .limit(initialLimit)
  if (ignoreSystemStatus) allRowsQ = allRowsQ.neq('visibility', 'system_status')

  const newRowsOnlyQ = (rows: Row<'chat_messages'>[] | undefined) => {
    // You can't use allRowsQ here because it keeps tacking on another gt clause
    let q = db
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .gt('id', maxBy(rows, 'id')?.id ?? 0)
    if (ignoreSystemStatus) q = q.neq('visibility', 'system_status')
    return q
  }

  const results = usePersistentSupabasePolling(
    'chat_messages',
    allRowsQ,
    newRowsOnlyQ,
    `public-chat-messages-${channelId}-${ms}ms-${initialLimit}limit-v1`,
    {
      ms,
      deps: [channelId],
      shouldUseLocalStorage: true,
    }
  )
  return results
    ? orderBy(results.map(convertPublicChatMessage), 'createdTime', 'desc')
    : undefined
}

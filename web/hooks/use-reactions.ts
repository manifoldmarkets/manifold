import { Reaction, ReactionContentTypes } from 'common/reaction'

import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { queryHandlers } from 'web/lib/supabase/batch-query-handlers'

export const useReactionsOnContent = (
  contentType: ReactionContentTypes,
  contentId: string
) => {
  // ian: Batching avoids running ~40 queries on the market page with lots of comments
  const [reactions] = useBatchedGetter<Reaction[] | undefined>(
    queryHandlers,
    `${contentType}-reactions`,
    contentId,
    undefined
  )

  return reactions
}

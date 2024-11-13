import { Reaction, ReactionContentTypes } from 'common/reaction'
import { useBatchedGetter } from './use-batched-getter'

export const useReactionsOnContent = (
  contentType: ReactionContentTypes,
  contentId: string
) => {
  // ian: Batching avoids running ~40 queries on the market page with lots of comments
  const [reactions] = useBatchedGetter<Reaction[] | undefined>(
    `${contentType}-reactions`,
    contentId,
    undefined
  )

  return reactions
}

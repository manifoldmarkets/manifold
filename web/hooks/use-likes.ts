import { Reaction, ReactionContentTypes } from 'common/reaction'
import { useBatchedGetter } from './use-batched-getter'

export const useLikesOnContent = (
  contentType: ReactionContentTypes,
  contentId: string
) => {
  // ian: Batching avoids running ~40 queries on the market page with lots of comments
  const [likes] = useBatchedGetter<Reaction[] | undefined>(
    `${contentType}-likes`,
    contentId,
    undefined
  )

  return likes
}

import { ReactionContentTypes } from 'common/reaction'
import { api } from './api'

export const unLike = async (
  contentId: string,
  contentType: ReactionContentTypes
) => {
  api('react', {
    remove: true,
    contentId,
    contentType,
  })
}

export const like = async (
  contentId: string,
  contentType: ReactionContentTypes
) => {
  api('react', {
    remove: false,
    contentId,
    contentType,
  })
}

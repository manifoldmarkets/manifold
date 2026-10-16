import {
  getNewsFeedBuild,
  isNewsFeedEnabled,
  setNewsStoryLike,
} from 'shared/news-feed/state'
import { APIError, APIHandler } from './helpers/endpoint'

/** Like or unlike a story in the feed. Kept by the feed server, not the
 * database, while this is a prototype. */
export const likeNewsStory: APIHandler<'like-news-story'> = async (
  { storyId, liked },
  auth
) => {
  if (!isNewsFeedEnabled()) {
    throw new APIError(400, 'The news feed is not enabled on this server.')
  }
  const build = getNewsFeedBuild()
  if (!build?.stories.some((s) => s.id === storyId)) {
    throw new APIError(404, 'That story is not in the feed.')
  }
  return { likeCount: setNewsStoryLike(storyId, auth.uid, liked) }
}

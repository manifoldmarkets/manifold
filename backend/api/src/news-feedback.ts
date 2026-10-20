import {
  addNewsFeedback,
  getNewsFeedBuild,
  isNewsFeedEnabled,
} from 'shared/news-feed/state'
import { APIError, APIHandler } from './helpers/endpoint'

/** A reader reports that a market shown on a story is wrong for it: not
 * about the story, not a direct test of the claim beside it, or missing
 * context, optionally with a better market. Kept by the feed server for
 * review while this is a prototype. */
export const newsFeedback: APIHandler<'news-feedback'> = async (
  props,
  auth
) => {
  if (!isNewsFeedEnabled()) {
    throw new APIError(400, 'The news feed is not enabled on this server.')
  }
  const story = getNewsFeedBuild()?.stories.find((s) => s.id === props.storyId)
  if (!story) throw new APIError(404, 'That story is not in the feed.')
  if (props.claimId && !story.claims?.some((c) => c.id === props.claimId)) {
    throw new APIError(404, 'That claim is not on this story.')
  }
  addNewsFeedback({ ...props, userId: auth?.uid })
  return { ok: true }
}

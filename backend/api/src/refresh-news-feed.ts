import { MINUTE_MS } from 'common/util/time'
import {
  getNewsFeedStatus,
  isNewsFeedEnabled,
  refreshNewsFeed,
} from 'shared/news-feed/state'
import { APIError, APIHandler } from './helpers/endpoint'

/** Rebuild the feed now rather than waiting for the refresher. Only on
 * servers running the feed (the prototype box), at most once a minute. */
export const refreshNewsFeedHandler: APIHandler<
  'refresh-news-feed'
> = async () => {
  if (!isNewsFeedEnabled()) {
    throw new APIError(400, 'The news feed is not enabled on this server.')
  }
  const started = await refreshNewsFeed('manual', {
    minIntervalMs: MINUTE_MS,
    waitForCompletion: false,
  })
  const status = getNewsFeedStatus()
  return {
    started,
    refreshing: status.refreshing,
    updatedTime: status.updatedTime,
  }
}

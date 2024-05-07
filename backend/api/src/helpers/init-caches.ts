import { buildUserInterestsCache } from 'shared/topic-interests'
export const DEBUG_TOPIC_INTERESTS = process.platform === 'darwin'
export const DEBUG_TIME_FRAME = '30 minutes'

export const initCaches = async () => {
  await buildUserInterestsCache()
}

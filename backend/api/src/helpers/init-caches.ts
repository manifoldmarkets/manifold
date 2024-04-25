import { buildUserInterestsCache } from 'api/get-feed'

export const initCaches = async () => {
  await buildUserInterestsCache()
}

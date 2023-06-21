import { useABTest } from './use-ab-test'

export const useIsFeedTest = () => {
  return useABTest('test feed homepage', {
    markets: false,
    feed: true,
  })
}

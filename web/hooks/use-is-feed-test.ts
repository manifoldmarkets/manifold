import { useABTest } from './use-ab-test'

export const useIsFeedTest = () => {
  return useABTest('test feed homepage 2', {
    questions: false,
    feed: true,
  })
}

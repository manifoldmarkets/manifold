import { useLover } from './use-lover'

export const useIsMatchmaker = () => {
  const lover = useLover()
  return !(lover && lover.looking_for_matches)
}

import { PRODUCT_MARKET_FIT_ENABLED } from 'common/envs/constants'
import { useSound } from 'use-sound'
import type { HookOptions, PlayOptions } from 'use-sound/dist/types'

//See https://github.com/joshwcomeau/use-sound
// mp3 files are in public/mp3s

export function useAudio<T = any>(fileName: string, options?: HookOptions<T>) {
  const [play] = useSound(`/mp3s/${fileName}`, options)

  return (params?: PlayOptions) => {
    if (PRODUCT_MARKET_FIT_ENABLED) play(params)
  }
}

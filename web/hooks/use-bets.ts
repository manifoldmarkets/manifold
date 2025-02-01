import { Bet } from 'common/bet'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'
import { APIParams } from 'common/api/schema'

export function useBetsOnce(options: APIParams<'bets'>) {
  const [bets, setBets] = usePersistentInMemoryState<Bet[] | undefined>(
    undefined,
    `use-bets-${JSON.stringify(options)}`
  )

  useEffectCheckEquality(() => {
    api('bets', options ?? {}).then((bets) => setBets(bets))
  }, [options])

  return bets
}

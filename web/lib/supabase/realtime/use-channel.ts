import { useRef } from 'react'

import { db } from '../db'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { Bet } from 'common/bet'

export const useChannel = <
  P extends { [event: string]: any },
  K extends keyof P = keyof P
>(
  channelId: string,
  onEvent: {
    // Note: the key is the event name, and the value is the payload callback.
    [E in K]: (payload: P[E]) => void
  }
) => {
  const current = useRef(onEvent)
  current.current = onEvent

  useEffectCheckEquality(() => {
    const channel = db.channel(channelId)
    for (const event of Object.keys(onEvent)) {
      channel.on('broadcast', { event }, (response: { payload: any }) => {
        const onPayload = (current.current as any)[event]
        onPayload(response.payload)
      })
    }
    channel.subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [channelId, Object.keys(onEvent)])
}

export const useContractBetChannel = (
  contractId: string,
  onBet: (bet: Bet) => void
) => {
  return useChannel(`contract:${contractId}`, {
    bet: onBet,
  })
}

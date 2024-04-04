import { useRef } from 'react'

import { db } from '../db'
import { useEffectCheckEquality } from 'web/hooks/use-effect-check-equality'
import { Bet } from 'common/bet'
import { JwtPayload, verify } from 'jsonwebtoken'
import { ENV_CONFIG } from 'common/envs/constants'

interface BroadcastPayload extends JwtPayload {
  data: Record<string, unknown>
}

function decodePayload(jwt: string) {
  const claims = verify(
    jwt,
    ENV_CONFIG.supabaseBroadcastKey
  ) as BroadcastPayload
  return claims.data
}

export const useBroadcast = (
  channelId: string,
  onEvent: { [ev: string]: (payload: any) => void }
) => {
  const current = useRef(onEvent)
  current.current = onEvent

  useEffectCheckEquality(() => {
    const channel = db.channel(channelId)
    for (const event of Object.keys(onEvent)) {
      channel.on('broadcast', { event }, (response) => {
        const onPayload = current.current[event]
        try {
          const jwt = response.payload?.jwt
          if (!jwt) {
            console.warn('Bad message from Realtime: ', response.payload)
          }
          onPayload(decodePayload(jwt))
        } catch (e) {
          console.warn('Error decoding Realtime JWT: ', e)
        }
      })
    }
    channel.subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [channelId, Object.keys(onEvent)])
}

export const useContractBetBroadcast = (
  contractId: string,
  onBet: (bet: Bet) => void
) => {
  return useBroadcast(`contract:${contractId}`, {
    bet: onBet,
  })
}

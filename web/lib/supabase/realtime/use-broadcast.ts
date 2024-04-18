import { Bet } from 'common/bet'
import {
  ChannelOptions,
  useChannel,
} from 'web/lib/supabase/realtime/use-channel'
import { JwtPayload, verify } from 'jsonwebtoken'
import { ENV_CONFIG } from 'common/envs/constants'

type BroadcastData = { [k: string]: any }
type BroadcastPayload = JwtPayload & { data: BroadcastData }
type BroadcastOptions = ChannelOptions & {
  onMessage: (event: string, data: BroadcastData) => void
}

function decodePayload(jwt: string) {
  const claims = verify(
    jwt,
    ENV_CONFIG.supabaseBroadcastKey
  ) as BroadcastPayload
  return claims.data
}

export function useBroadcast(channelId: string, opts: BroadcastOptions) {
  const { onEnabled, onMessage, ...rest } = opts
  const channel = useChannel(channelId, {
    onEnabled: (chan) => {
      for (const event of Object.keys(onMessage)) {
        chan.on('broadcast', { event }, (response) => {
          try {
            const jwt = response.payload?.jwt
            if (!jwt) {
              console.warn('Bad message from Realtime: ', response.payload)
            }
            onMessage(response.event, decodePayload(jwt))
          } catch (e) {
            console.warn('Error decoding Realtime JWT: ', e)
          }
        })
      }
      onEnabled?.(chan)
    },
    ...rest,
  })
  return channel
}

export const useContractBetBroadcast = (
  contractId: string,
  onBet: (bet: Bet) => void
) => {
  return useBroadcast(`contract:${contractId}:bets`, {
    onMessage: (_event, data) => onBet(data as Bet),
  })
}

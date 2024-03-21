import { createSupabaseClient } from './init'

export const joinChannel = async (channelId: string) => {
  const db = createSupabaseClient()
  const channel = db.channel(channelId)

  await new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        resolve(null)
      } else if (err) {
        reject(err)
      } else {
        reject(status)
      }
    })
  })

  return channel
}

export const joinContractChannel = (contractId: string) => {
  return joinChannel(`contract:${contractId}`)
}

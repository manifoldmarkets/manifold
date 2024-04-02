import { SupabaseClient } from './init'

export async function broadcast(
  db: SupabaseClient,
  channel: string,
  event: string,
  payload: any
) {
  const chan = db.channel(channel)
  try {
    await chan.send({ type: 'broadcast', event, payload })
  } finally {
    await db.removeChannel(chan)
  }
}

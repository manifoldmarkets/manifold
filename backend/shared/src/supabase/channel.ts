import { getInstanceId, getInstanceHostname } from './init'

type BroadcastMessage = {
  channel: string
  event: string
  payload: object
}

// mqp: it's honestly easier to just post it ourselves than use the Supabase
// client library, because then we don't have to do the song and dance of
// creating the `SupabaseClient` and `RealtimeChannel` and such nonsense

// TODO: apply Supabase's new auth stuff if you want to use this

export async function broadcast(...messages: BroadcastMessage[]) {
  const key = process.env.SUPABASE_KEY
  if (!key) {
    throw new Error("Can't connect to Supabase; no process.env.SUPABASE_KEY.")
  }
  const instanceId = getInstanceId()
  const instanceHostname = getInstanceHostname(instanceId)

  // see @supabase/realtime-js/RealtimeChannel.js
  const endpoint = `https://${instanceHostname}/realtime/v1/api/broadcast`
  const body = JSON.stringify({
    messages: messages.map((m) => ({
      topic: m.channel,
      event: m.event,
      payload: m.payload,
    })),
  })
  return await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body,
  })
}

import { getInstanceId, getInstanceHostname } from './init'
import { sign } from 'jsonwebtoken'

type BroadcastMessage = {
  channel: string
  event: string
  payload: object
}

// mqp: there's no built-in auth, so we sign the payload with a short expiry

function signPayload(payload: object) {
  const secret = process.env.BROADCAST_SECRET
  if (!secret) {
    throw new Error("Can't sign broadcasts; no process.env.BROADCAST_SECRET")
  }
  return sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: 60, // seconds
  })
}

// mqp: it's honestly easier to just post it ourselves than use the Supabase
// client library, because then we don't have to do the song and dance of
// creating the `SupabaseClient` and `RealtimeChannel` and such nonsense

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
      payload: { jwt: signPayload(m.payload) },
    })),
  })
  return await fetch(endpoint, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body,
  })
}

import { auth } from 'web/lib/firebase/users'
import { PlaceBetParams } from 'web/pages/api/v0/bet'

export function placeBet(params: PlaceBetParams) {
  return call('/api/v0/bet', params)
}

// Add new endpoints to call here.

async function call<T>(endpoint: string, params: T) {
  const token = await auth.currentUser?.getIdToken()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params ?? {}),
  })
  return await res.json()
}

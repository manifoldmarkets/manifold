// Preserve access across SPA navigation even when both storage APIs are blocked.
const memoryTokens = new Map<string, string>()

export const pokerTokenKey = (id: string) => `poker-access-${id}`
const validToken = (value: string | null | undefined) =>
  !!value && /^[a-f0-9]{64}$/.test(value)

export function savePokerToken(id: string, token: string) {
  memoryTokens.set(id, token)
  // localStorage survives tab closure. Fall back to this tab when persistent
  // storage is unavailable; the lobby can always release an authenticated seat.
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storage].setItem(pokerTokenKey(id), token)
      return true
    } catch {
      // Storage may be disabled or full.
    }
  }
  return false
}

export function restorePokerToken(id: string) {
  const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
    'invite'
  )
  let token = validToken(fragment) ? fragment! : undefined
  if (!token) {
    for (const storage of ['localStorage', 'sessionStorage'] as const) {
      try {
        const stored = window[storage].getItem(pokerTokenKey(id))
        if (validToken(stored)) {
          token = stored!
          break
        }
      } catch {
        // Still allow an invite to work when browser storage is unavailable.
      }
    }
  }
  token ??= memoryTokens.get(id)
  // Also migrate invitations saved by the earlier session-only implementation.
  const saved = token ? savePokerToken(id, token) : false
  // Module memory survives SPA navigation, but not a reload. Keep a valid
  // invitation in the URL until one of the browser storage APIs accepts it.
  if (fragment && (saved || !validToken(fragment))) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname
    )
  }
  return token
}

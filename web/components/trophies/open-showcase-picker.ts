// The Trophies tab and the profile showcase sit in different parts of the
// profile page, and the showcase is only mounted while the profile header is
// expanded. "Pin to profile" on a trophy card leaves a request here and fires
// a window event: the profile page expands its header on the event, and the
// showcase takes the request when it hears the event or when it mounts.
export const OPEN_SHOWCASE_PICKER_EVENT = 'open-showcase-picker'

export type ShowcasePickerRequest = { pinId?: string }

// A request is for one profile, and only for a moment: one left behind by a
// navigation must not open on another profile later.
const REQUEST_TTL_MS = 10_000

let pending:
  | { userId: string; request: ShowcasePickerRequest; at: number }
  | undefined

export function openShowcasePicker(
  userId: string,
  request: ShowcasePickerRequest
) {
  pending = { userId, request, at: Date.now() }
  window.dispatchEvent(new Event(OPEN_SHOWCASE_PICKER_EVENT))
}

export function takeShowcasePickerRequest(
  userId: string
): ShowcasePickerRequest | null {
  if (!pending) return null
  const { userId: forUser, request, at } = pending
  if (Date.now() - at > REQUEST_TTL_MS) {
    pending = undefined
    return null
  }
  if (forUser !== userId) return null
  pending = undefined
  return request
}

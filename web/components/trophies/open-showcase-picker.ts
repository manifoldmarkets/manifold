// The Trophies tab and the profile showcase sit in different parts of the
// profile page, and the showcase is only mounted while the profile header is
// expanded. "Pin to profile" on a trophy card leaves a request here and fires
// a window event: the profile page expands its header on the event, and the
// showcase takes the request when it hears the event or when it mounts.
export const OPEN_SHOWCASE_PICKER_EVENT = 'open-showcase-picker'

export type ShowcasePickerRequest = { pinId?: string }

let pendingRequest: ShowcasePickerRequest | null = null

export function openShowcasePicker(request: ShowcasePickerRequest) {
  pendingRequest = request
  window.dispatchEvent(new Event(OPEN_SHOWCASE_PICKER_EVENT))
}

export function takeShowcasePickerRequest(): ShowcasePickerRequest | null {
  const request = pendingRequest
  pendingRequest = null
  return request
}

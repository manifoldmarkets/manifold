// The Trophies tab and the profile showcase sit in different parts of the
// profile page. "Pin to profile" on a trophy card asks the showcase to open
// its picker (and pin the trophy) through this window event. The profile page
// also listens, to expand its header so the showcase is mounted.
export const OPEN_SHOWCASE_PICKER_EVENT = 'open-showcase-picker'

export type OpenShowcasePickerDetail = { pinId?: string }

export function openShowcasePicker(detail: OpenShowcasePickerDetail) {
  window.dispatchEvent(
    new CustomEvent<OpenShowcasePickerDetail>(OPEN_SHOWCASE_PICKER_EVENT, {
      detail,
    })
  )
}

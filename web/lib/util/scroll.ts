export const scrollIntoViewCentered = (element: HTMLElement) => {
  // Because elem.scrollIntoView({ block: 'center' }) doesn't work on safari (mobile/desktop).
  const elementRect = element.getBoundingClientRect()
  const absoluteElementTop = elementRect.top + window.pageYOffset
  const middle = absoluteElementTop - window.innerHeight / 2
  window.scrollTo(0, middle)
}

const isIOSDevice = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !(window as any).MSStream

const waitForImagesAbove = (element: HTMLElement, timeoutMs: number) => {
  const elementTop = element.getBoundingClientRect().top + window.scrollY
  const pending = Array.from(document.images).filter((img) => {
    const imgTop = img.getBoundingClientRect().top + window.scrollY
    return imgTop < elementTop && !img.complete
  })
  if (pending.length === 0) return Promise.resolve()

  return Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

export const scrollIntoViewCentered = (element: HTMLElement) => {
  // Small delay to ensure iOS scroll container is set up (it's applied via useEffect)
  // and layout is complete
  setTimeout(async () => {
    // Wait for images above the target to load so the layout settles before we scroll;
    // otherwise late-loading images push the target below the centered position.
    await waitForImagesAbove(element, 1500)

    // On iOS, we use a .page-scroll-container with position:fixed and overflow-y:auto,
    // so we need to scroll that container instead of the window.
    const scrollContainer = document.querySelector(
      '.page-scroll-container'
    ) as HTMLElement | null

    if (scrollContainer) {
      // iOS with scroll container - calculate position relative to container
      const containerRect = scrollContainer.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Element's position relative to the scroll container's viewport
      const elementTopInContainer =
        elementRect.top - containerRect.top + scrollContainer.scrollTop

      const halfContainerHeight = containerRect.height / 2
      const middle =
        elementTopInContainer -
        halfContainerHeight +
        Math.min(elementRect.height / 2, halfContainerHeight - 58)

      scrollContainer.scrollTo({ top: middle, behavior: 'auto' })
    } else if (isIOSDevice()) {
      // iOS but scroll container not set up yet - use native scrollIntoView
      // which should at least get the element visible
      element.scrollIntoView({ behavior: 'auto', block: 'center' })
    } else {
      // Desktop/non-iOS: elem.scrollIntoView({ block: 'center' }) doesn't work on Safari
      // for window scroll, so we calculate and scroll manually
      const elementRect = element.getBoundingClientRect()
      const absoluteElementTop = elementRect.top + window.scrollY
      const halfWindowHeight = window.innerHeight / 2
      const middle =
        absoluteElementTop -
        halfWindowHeight +
        Math.min(elementRect.height / 2, halfWindowHeight - 58)
      window.scrollTo(0, middle)
    }
  }, 100)
}

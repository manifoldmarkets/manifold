import { ReactNode } from 'react'

import { Col } from 'web/components/layout/col'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { track } from 'web/lib/service/analytics'

/**
 * Fires `view election section` once per mount when a section scrolls into
 * view.
 *
 * The elections page previously had no scroll-depth signal of any kind: we
 * could see which sections were *clicked*, but never which were *reached*. That
 * made section ordering unmeasurable — a section with few clicks was
 * indistinguishable from one nobody ever scrolled to. Pair the resulting
 * `view election section` events with the existing click events to get a real
 * per-section reach → click rate.
 *
 * Renders a `Col` (not a bare div) so it drops into the page's flex column as a
 * single flex item, exactly like the section it wraps.
 */
export function SectionInView(props: {
  section: string
  className?: string
  children: ReactNode
}) {
  const { section, className, children } = props

  const { ref } = useIsVisible(
    () => track('view election section', { section }),
    true // fire once; we want reach, not an impression count
  )

  return (
    <Col ref={ref} className={className}>
      {children}
    </Col>
  )
}

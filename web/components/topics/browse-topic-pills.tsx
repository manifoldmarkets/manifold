import clsx from 'clsx'
import { groupPath, LiteGroup } from 'common/group'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { MAX_SHOWN } from '../search/user-results'
import { removeEmojis } from 'common/util/string'
import Link from 'next/link'
import { useIsMobile } from 'web/hooks/use-is-mobile'
const MAX_MOBILE_SHOWN = 4

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  className?: string
  clipOnMobile?: boolean
  initialShown?: number
}) => {
  const { topics, className, clipOnMobile = false, initialShown } = props
  const isMobile = useIsMobile()
  const [showMore, setShowMore] = useState<boolean>(false)
  const maxShown =
    initialShown ?? (isMobile && clipOnMobile ? MAX_MOBILE_SHOWN : MAX_SHOWN)
  const shownTopics = showMore ? topics : topics.slice(0, maxShown)

  return (
    <Col className={className}>
      <Row className={clsx('flex-wrap gap-1.5 text-sm')}>
        {shownTopics.map((g) => (
          <Link
            prefetch={false}
            key={g.slug}
            href={groupPath(g.slug)}
            className={clsx(
              'bg-canvas-50 hover:bg-primary-50 text-ink-600 hover:text-primary-700 rounded-md px-2.5 py-1 font-medium transition-colors'
            )}
          >
            {removeEmojis(g.name)}
          </Link>
        ))}
        {topics.length > maxShown && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-primary-600 hover:text-primary-700 bg-canvas-50 hover:bg-primary-50 flex flex-row items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors"
          >
            {showMore ? `Show less` : `+${topics.length - maxShown} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}

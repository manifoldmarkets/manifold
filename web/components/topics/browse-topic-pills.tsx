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
      <Row className={clsx('flex-wrap gap-1 text-sm')}>
        {shownTopics.map((g) => (
          <Link
            prefetch={false}
            key={g.slug}
            href={groupPath(g.slug)}
            className={clsx(
              'bg-ink-100 hover:bg-ink-200 text-ink-600 rounded p-1'
            )}
          >
            {removeEmojis(g.name)}
          </Link>
        ))}
        {topics.length > maxShown && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-primary-700 bg-ink-100 hover:bg-ink-200 flex flex-row items-center gap-1 rounded p-2 py-1"
          >
            {showMore ? `Show less` : `Show ${topics.length - maxShown} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}

import clsx from 'clsx'
import { groupPath, LiteGroup } from 'common/group'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { MAX_SHOWN } from '../search/user-results'
import { removeEmojis } from 'common/util/string'
import Link from 'next/link'

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  className?: string
}) => {
  const { topics, className } = props
  const [showMore, setShowMore] = useState<boolean>(false)
  const shownTopics = showMore ? topics : topics.slice(0, MAX_SHOWN)

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
        {topics.length > MAX_SHOWN && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-primary-700 bg-ink-100 hover:bg-ink-200 flex flex-row items-center gap-1 rounded p-2 py-1"
          >
            {showMore ? `Show less` : `Show ${topics.length - MAX_SHOWN} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}

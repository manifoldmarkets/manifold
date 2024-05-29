import clsx from 'clsx'
import { LiteGroup } from 'common/group'
import { ReactNode, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MAX_SHOWN, MAX_SHOWN_MOBILE } from '../search/user-results'
import { removeEmojis } from 'common/topics'

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  setTopicSlug: (slug: string) => void
  className?: string
  forYouPill: ReactNode
}) => {
  const { topics, forYouPill, className, setTopicSlug } = props
  const [showMore, setShowMore] = useState<boolean>(false)
  const isMobile = useIsMobile()
  const MAX_INIT_TOPICS = isMobile ? MAX_SHOWN_MOBILE : MAX_SHOWN
  const shownTopics = showMore ? topics : topics.slice(0, MAX_INIT_TOPICS)

  return (
    <Col className={className}>
      <Row className={clsx('flex-wrap gap-1 text-sm')}>
        {forYouPill}
        {shownTopics.map((g) => (
          <button
            key={'pill-' + g.slug}
            onClick={() => setTopicSlug(g.slug)}
            className="bg-ink-200 hover:bg-ink-300 rounded p-1"
          >
            <span className="text-ink-400">#</span>
            {removeEmojis(g.name)}
          </button>
        ))}
        {topics.length > MAX_INIT_TOPICS && (
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-primary-700 bg-ink-200 hover:bg-ink-300 flex flex-row items-center gap-1 rounded p-2 py-1"
          >
            {showMore
              ? `Show less`
              : `Show ${topics.length - MAX_INIT_TOPICS} more`}
          </button>
        )}
      </Row>
    </Col>
  )
}

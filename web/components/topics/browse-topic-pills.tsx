import clsx from 'clsx'
import { LiteGroup } from 'common/group'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SORT_KEY } from 'web/components/supabase-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useIsAuthorized } from 'web/hooks/use-user'
import { MAX_SHOWN, MAX_SHOWN_MOBILE } from '../search/user-results'

export const BrowseTopicPills = (props: {
  topics: LiteGroup[]
  setTopicSlug: (slug: string) => void
  currentTopicSlug: string | undefined
  className?: string
}) => {
  const { topics, className, setTopicSlug, currentTopicSlug } = props
  const isAuth = useIsAuthorized()
  const [showMore, setShowMore] = useState<boolean>(
    false
  )
  const router = useRouter()
  const sort = router.query[SORT_KEY] as string
    const isMobile = useIsMobile()
    const MAX_INIT_TOPICS = isMobile ? MAX_SHOWN_MOBILE : MAX_SHOWN
    const shownTopics = showMore ? topics : topics.slice(0, MAX_INIT_TOPICS)

  return (
    <Col className={className}>
      <Row
        className={clsx(
          'flex-wrap gap-1 text-sm'
        )}
      >
        {shownTopics.map((g) => (
          <button
            key={'pill-' + g.slug}
            onClick={() => setTopicSlug(g.slug)}
            className="bg-ink-200 hover:bg-ink-300 rounded p-1"
          >
            <span className="text-ink-400">#</span>
            {g.name}
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

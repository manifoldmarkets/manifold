import { Group } from 'common/group'
import { PillButton } from 'web/components/buttons/pill-button'
import { useIsAuthorized } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/solid'
import { useState } from 'react'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { SORT_KEY } from 'web/components/contracts-search'
import { useRouter } from 'next/router'

export const BrowseTopicPills = (props: {
  topics: Group[]
  setTopicSlug: (slug: string) => void
  currentTopicSlug: string | undefined
}) => {
  const { topics, setTopicSlug, currentTopicSlug } = props
  const isAuth = useIsAuthorized()
  const [showMore, setShowMore] = useState<boolean>(false)
  const router = useRouter()
  const sort = router.query[SORT_KEY] as string

  return (
    <Col className={'bg-canvas-0 relative w-full pl-1 sm:hidden'}>
      <Row
        className={clsx(
          'scrollbar-hide gap-0.5 overflow-auto',
          showMore ? 'h-[6.75rem] flex-wrap' : 'h-[2rem]'
        )}
      >
        {isAuth && (sort == undefined || sort == 'score') && (
          <PillButton
            key={'pill-for-you'}
            selected={currentTopicSlug === 'for-you'}
            onSelect={() => setTopicSlug('for-you')}
          >
            ⭐️ For you
          </PillButton>
        )}

        {topics.map((g) => (
          <PillButton
            key={'pill-' + g.slug}
            selected={currentTopicSlug === g.slug}
            onSelect={() => setTopicSlug(g.slug)}
          >
            {g.name}
          </PillButton>
        ))}
      </Row>
      <div className="absolute right-0 top-0 z-10 flex w-10 cursor-pointer select-none items-center justify-center overflow-x-hidden">
        {showMore ? (
          <ChevronDownIcon
            onClick={() => setShowMore(false)}
            className="bg-primary-50 text-primary-700 h-7 w-7 rounded-full"
          />
        ) : (
          <ChevronRightIcon
            onClick={() => setShowMore(true)}
            className="bg-primary-50 text-primary-700 h-7 w-7 rounded-full"
          />
        )}
      </div>
    </Col>
  )
}

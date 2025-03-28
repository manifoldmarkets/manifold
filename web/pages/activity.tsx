import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { SiteActivity } from 'web/components/site-activity'
import { TRADE_TERM } from 'common/envs/constants'
import { TopicPillSelector } from 'web/components/topics/topic-selector'
import { useState } from 'react'
import { LiteGroup } from 'common/group'
import { DropdownPill } from 'web/components/search/filter-pills'
import DropdownMenu from 'web/components/widgets/dropdown-menu'

export const ACTIVITY_TYPES = [
  { name: 'All activity', value: ['bets', 'comments', 'markets'] },
  { name: 'Trades', value: ['bets'] },
  { name: 'Comments', value: ['comments'] },
  { name: 'Markets', value: ['markets'] },
] as const

export default function ActivityPage() {
  const [selectedTopic, setSelectedTopic] = useState<LiteGroup | undefined>()
  const [selectedTypes, setSelectedTypes] = useState<
    ('bets' | 'comments' | 'markets')[]
  >(['bets', 'comments', 'markets'])

  return (
    <Page trackPageView={'activity page'}>
      <SEO
        title="Activity"
        description={`Watch all site activity live, including ${TRADE_TERM}s, comments, and new questions.`}
        url="/activity"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Row
          className={
            'w-full items-center justify-between pt-1 sm:justify-start sm:gap-4'
          }
        >
          <span className="text-primary-700 line-clamp-1 shrink px-1 text-2xl">
            Activity
          </span>
          <Row className="gap-2">
            <TopicPillSelector
              topic={selectedTopic}
              setTopic={setSelectedTopic}
            />
            <DropdownMenu
              closeOnClick
              selectedItemName={
                ACTIVITY_TYPES.find(
                  (t) =>
                    t.value.length === selectedTypes.length &&
                    t.value.every((v) => selectedTypes.includes(v))
                )?.name ?? 'All activity'
              }
              items={ACTIVITY_TYPES.map((type) => ({
                name: type.name,
                onClick: () => setSelectedTypes([...type.value]),
              }))}
              buttonContent={(open) => (
                <DropdownPill open={open}>
                  {ACTIVITY_TYPES.find(
                    (t) =>
                      t.value.length === selectedTypes.length &&
                      t.value.every((v) => selectedTypes.includes(v))
                  )?.name ?? 'All activity'}
                </DropdownPill>
              )}
            />
          </Row>
        </Row>
        <SiteActivity
          className="w-full"
          topicSlug={selectedTopic?.slug}
          types={selectedTypes}
        />
      </Col>
    </Page>
  )
}

import { useEffect, useState } from 'react'
import { noop, uniq } from 'lodash'

import { Col } from 'web/components/layout/col'
import { leaveGroup } from 'web/lib/supabase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { joinGroup, updateUserEmbedding } from 'web/lib/firebase/api'
import { Group } from 'common/group'
import { db } from 'web/lib/supabase/db'
import { removeEmojis } from 'web/components/contract/market-groups'
import { Row } from 'web/components/layout/row'
import { GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW } from 'common/envs/constants'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'

export function TopicSelectorDialog(props: {
  skippable: boolean
  opaque: boolean
}) {
  const { skippable, opaque } = props

  const user = useUser()
  const [userSelectedCategories, setUserSelectedCategories] = useState<
    string[] | undefined
  >()
  const [isLoading, setIsLoading] = useState(false)
  const [trendingCategories, setTrendingCategories] = useState<Group[]>()
  const topics = Object.keys(TOPICS_TO_SUBTOPICS)
  const hardCodedCategoryIds = topics
    .map((topic) => getSubtopics(topic))
    .flat()
    .map(([_, __, groupId]) => groupId)

  useEffect(() => {
    db.from('groups')
      .select('id,data')
      .not('id', 'in', `(${hardCodedCategoryIds.join(',')})`)
      .not('slug', 'in', `(${GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW.join(',')})`)
      .or(`slug.not.ilike.%manifold%`)
      .order('importance_score', { ascending: false })
      .limit(15)
      .then(({ data }) => {
        const categories = data?.map((groupData) => ({
          ...(groupData?.data as Group),
          id: groupData.id,
        }))
        setTrendingCategories(categories)
      })
  }, [])

  const closeDialog = async (skipUpdate: boolean) => {
    setIsLoading(true)

    if (user && !skipUpdate) await updateUserEmbedding()

    window.location.reload()
    // setOpen(false)
  }
  const selectedCategories: string[] = userSelectedCategories ?? []

  const pillButton = (
    category: string,
    categoryWithEmoji: string,
    groupId: string
  ) => (
    <PillButton
      key={category}
      selected={selectedCategories.includes(category)}
      onSelect={() => {
        if (selectedCategories.includes(category)) {
          setUserSelectedCategories(
            selectedCategories.filter((t) => t !== category)
          )
          if (groupId && user) leaveGroup(groupId, user.id)
        } else {
          setUserSelectedCategories(uniq([...selectedCategories, category]))
          if (groupId && user) joinGroup({ groupId })
        }
      }}
    >
      {categoryWithEmoji}
    </PillButton>
  )

  return (
    <Modal
      open
      setOpen={skippable ? closeDialog : noop}
      className="bg-canvas-0 overflow-hidden rounded-md"
      size={'lg'}
      bgOpaque={opaque}
    >
      <Col className="h-[32rem] overflow-y-auto">
        <div className="bg-canvas-0 sticky top-0 py-4 px-5">
          <p className="text-primary-700 mb-2 text-2xl">What interests you?</p>
          <p>Select 3 or more categories to personalize your experience</p>
        </div>
        <Col className={'mb-4 px-5'}>
          <div className="text-primary-700 mb-1 text-sm">Trending now</div>
          <Row className={'flex-wrap gap-1 '}>
            {trendingCategories ? (
              trendingCategories.map((group) => (
                <div className="" key={group.id + '-section'}>
                  {pillButton(removeEmojis(group.name), group.name, group.id)}
                </div>
              ))
            ) : (
              <LoadingIndicator />
            )}
          </Row>
        </Col>

        {topics.map((topic) => (
          <div className="mb-4 px-5" key={topic + '-section'}>
            <div className="text-primary-700 text-sm">{topic.slice(3)}</div>
            <Row className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic)
                .filter(([_, __, groupId]) => !!groupId)
                .map(([subtopicWithEmoji, subtopic, groupId]) => {
                  return pillButton(subtopic, subtopicWithEmoji, groupId)
                })}
            </Row>
          </div>
        ))}

        <div className="from-canvas-0 pointer-events-none sticky bottom-0 bg-gradient-to-t to-transparent text-right">
          <span className="pointer-events-auto inline-flex gap-2 p-6 pt-2">
            {skippable && (
              <Button
                onClick={() => closeDialog(true)}
                color="gray-white"
                className="bg-canvas-50 text-ink"
              >
                Skip
              </Button>
            )}
            <Button
              onClick={() => closeDialog(false)}
              disabled={(userSelectedCategories ?? []).length <= 2}
              loading={isLoading}
            >
              Done
            </Button>
          </span>
        </div>
      </Col>
    </Modal>
  )
}

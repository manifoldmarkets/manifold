import { useEffect, useState } from 'react'
import { noop, uniq } from 'lodash'

import { Col } from 'web/components/layout/col'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { getSubtopics, removeEmojis, TOPICS_TO_SUBTOPICS } from 'common/topics'
import { joinGroup, updateUserEmbedding } from 'web/lib/firebase/api'
import { Group } from 'common/group'
import { Row } from 'web/components/layout/row'
import ShortToggle from '../widgets/short-toggle'
import { InfoTooltip } from '../widgets/info-tooltip'
import { updatePrivateUser, updateUser } from 'web/lib/firebase/users'
import { leaveGroup } from 'web/lib/supabase/groups'

export function TopicSelectorDialog(props: {
  skippable: boolean
  opaque: boolean
  trendingCategories: Group[]
  userInterestedCategories: Group[]
  userBetInCategories: Group[]
}) {
  const {
    skippable,
    opaque,
    userInterestedCategories,
    trendingCategories,
    userBetInCategories,
  } = props

  const user = useUser()
  const privateUser = usePrivateUser()

  const [userSelectedCategories, setUserSelectedCategories] = useState<
    string[] | undefined
  >()

  const topics = Object.keys(TOPICS_TO_SUBTOPICS)

  useEffect(() => {
    if (userBetInCategories.length > 0) {
      userBetInCategories.forEach((group) => selectCategory(group.id))
    } else if (userInterestedCategories.length > 0) {
      userInterestedCategories.forEach((group) => selectCategory(group.id))
    }
  }, [])

  const selectCategory = (groupId: string) => {
    if (selectedCategories.includes(groupId)) {
      if (user) leaveGroup(groupId, user.id)
      setUserSelectedCategories((cats) =>
        (cats ?? []).filter((t) => t !== groupId)
      )
    } else {
      setUserSelectedCategories((cats) => uniq([...(cats ?? []), groupId]))
      if (user) joinGroup({ groupId })
    }
  }

  const [isLoading, setIsLoading] = useState(false)

  const closeDialog = async (skipUpdate: boolean) => {
    setIsLoading(true)

    if (user && !skipUpdate) await updateUserEmbedding()

    if (user) await updateUser(user.id, { shouldShowWelcome: false })

    window.location.reload()
    // setOpen(false)
  }
  const selectedCategories: string[] = userSelectedCategories ?? []

  const pillButton = (
    categoryWithEmoji: string,
    categoryName: string,
    groupId: string
  ) => (
    <PillButton
      key={categoryName}
      selected={selectedCategories.includes(groupId)}
      onSelect={() => selectCategory(groupId)}
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
            {trendingCategories.map((group) => (
              <div className="" key={group.id + '-section'}>
                {pillButton(group.name, removeEmojis(group.name), group.id)}
              </div>
            ))}
          </Row>
        </Col>

        {topics.map((topic) => (
          <div className="mb-4 px-5" key={topic + '-section'}>
            <div className="text-primary-700 text-sm">{topic.slice(3)}</div>
            <Row className="flex flex-wrap gap-x-1 gap-y-1.5">
              {getSubtopics(topic)
                .filter(([_, __, groupId]) => !!groupId)
                .map(([subtopicWithEmoji, subtopic, groupId]) => {
                  return pillButton(subtopicWithEmoji, subtopic, groupId)
                })}
            </Row>
          </div>
        ))}

        <div className="my-4 px-5" key={'nsfw'}>
          <div className="text-primary-700 text-md">
            Show NSFW content{' '}
            <InfoTooltip text="Not-safe-for-work (NSFW) means sexually gratuitous, offensive, or other content unsuitable for viewing at work or in public places." />
          </div>
          <ShortToggle
            on={!privateUser?.blockedGroupSlugs.includes('nsfw')}
            setOn={(enabled) => {
              const filteredSlugs =
                privateUser?.blockedGroupSlugs.filter(
                  (slug) => slug !== 'nsfw'
                ) ?? []

              const blockedGroupSlugs = !enabled
                ? filteredSlugs.concat(['nsfw'])
                : filteredSlugs

              updatePrivateUser(privateUser?.id ?? '', {
                blockedGroupSlugs,
              })
            }}
          />
        </div>

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

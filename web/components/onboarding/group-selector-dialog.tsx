import { sortBy } from 'lodash'
import React, { useRef } from 'react'

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/title'
import { useGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { Group } from 'common/group'
import { LoadingIndicator } from '../loading-indicator'
import { withTracking } from 'web/lib/service/analytics'

export default function GroupSelectorDialog(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props

  const groups = useGroups()
  const user = useUser()
  const memberGroupIds = useMemberGroupIds(user) || []
  const cachedGroups = useRef<Group[]>()

  if (groups && !cachedGroups.current) {
    cachedGroups.current = groups
  }

  const excludedGroups = [
    'features',
    'personal',
    'private',
    'nomic',
    'proofnik',
    'free money',
    'motivation',
    'sf events',
    'please resolve',
    'short-term',
    'washifold',
  ]

  const displayedGroups = sortBy(cachedGroups.current ?? [], [
    (group) => -1 * group.totalMembers,
    (group) => -1 * group.totalContracts,
  ])
    .filter((group) => group.anyoneCanJoin)
    .filter((group) =>
      excludedGroups.every((name) => !group.name.toLowerCase().includes(name))
    )
    .filter(
      (group) =>
        (group.mostRecentContractAddedTime ?? 0) >
        Date.now() - 1000 * 60 * 60 * 24 * 7
    )
    .slice(0, 30)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="h-[32rem] rounded-md bg-white px-8 py-6 text-sm font-light md:h-[40rem] md:text-lg">
        <Title text="What interests you?" />
        <p className="mb-4">
          Choose among the categories below to personalize your Manifold
          experience.
        </p>

        <div className="scrollbar-hide items-start gap-2 overflow-x-auto">
          {!user || displayedGroups.length === 0 ? (
            <LoadingIndicator spinnerClassName="h-12 w-12" />
          ) : (
            displayedGroups.map((group) => (
              <PillButton
                key={group.id}
                selected={memberGroupIds.includes(group.id)}
                onSelect={withTracking(
                  () =>
                    memberGroupIds.includes(group.id)
                      ? leaveGroup(group, user.id)
                      : joinGroup(group, user.id),
                  'toggle group pill',
                  { group: group.slug }
                )}
                className="mr-1 mb-2 max-w-[12rem] truncate"
              >
                {group.name}
              </PillButton>
            ))
          )}
        </div>
      </Col>
      <Col>
        <Button onClick={() => setOpen(false)}>Done</Button>
      </Col>
    </Modal>
  )
}

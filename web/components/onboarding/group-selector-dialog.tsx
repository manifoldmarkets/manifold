import React, { useRef } from 'react'

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { useAllGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { ExplicitPillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/buttons/button'
import { Group, filterTopGroups } from 'common/group'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { withTracking } from 'web/lib/service/analytics'
import { Row } from 'web/components/layout/row'

export default function GroupSelectorDialog(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props

  const groups = useAllGroups()
  const user = useUser()
  const memberGroupIds = useMemberGroupIds(user) || []
  const cachedGroups = useRef<Group[]>()

  if (groups && !cachedGroups.current) {
    cachedGroups.current = groups
  }

  const displayedGroups = filterTopGroups(cachedGroups.current ?? [])

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="h-[32rem] rounded-md bg-white px-8 py-6 text-sm font-light md:h-[40rem] md:text-lg">
        <Title children="What interests you?" />
        <p className="mb-4">
          Select the topics you're interested in to personalize your Manifold
          experience.
        </p>

        <div className="scrollbar-hide items-start gap-2 overflow-x-auto">
          {!user || displayedGroups.length === 0 ? (
            <LoadingIndicator spinnerClassName="h-12 w-12" />
          ) : (
            displayedGroups.map((group) => (
              <ExplicitPillButton
                key={group.id}
                selected={memberGroupIds.includes(group.id)}
                onSelect={withTracking(
                  () =>
                    memberGroupIds.includes(group.id)
                      ? leaveGroup(group.id, user.id)
                      : joinGroup(group.id, user.id),
                  'toggle group pill',
                  { group: group.slug }
                )}
                className="mr-1 mb-2 max-w-[12rem] truncate"
              >
                {group.name}
              </ExplicitPillButton>
            ))
          )}
        </div>
        <Row className={'justify-end'}>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </Row>
      </Col>
    </Modal>
  )
}

import { sortBy } from 'lodash'
import React from 'react'

import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/title'
import { useGroups, useMemberGroupIds } from 'web/hooks/use-group'
import { joinGroup, leaveGroup } from 'web/lib/firebase/groups'
import { useUser } from 'web/hooks/use-user'
import { Modal } from 'web/components/layout/modal'
import { PillButton } from 'web/components/buttons/pill-button'
import { Button } from 'web/components/button'

export default function GroupSelectorDialog(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props

  const groups = useGroups()
  const user = useUser()
  const memberGroupIds = useMemberGroupIds(user) || []

  const displayedGroups = sortBy(groups, [
    (group) => -1 * group.totalMembers,
    (group) => -1 * group.totalContracts,
  ]).slice(0, 100)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className="h-[32rem] rounded-md bg-white px-8 py-6 text-sm font-light md:h-[40rem] md:text-lg">
        <Title text="What interests you?" />
        <p className="mb-4">
          Choose among the categories below to personalize your Manifold
          experience.
        </p>

        <div className="scrollbar-hide items-start gap-2 overflow-x-auto">
          {user &&
            displayedGroups.map(
              (group) =>
                group.anyoneCanJoin && (
                  <PillButton
                    selected={memberGroupIds.includes(group.id)}
                    onSelect={() =>
                      memberGroupIds.includes(group.id)
                        ? leaveGroup(group, user.id)
                        : joinGroup(group, user.id)
                    }
                    className="mr-1 mb-2 max-w-[12rem] truncate"
                  >
                    {group.name}
                  </PillButton>
                )
            )}
        </div>
      </Col>
      <Col>
        <Button onClick={() => setOpen(false)}>Done</Button>
      </Col>
    </Modal>
  )
}

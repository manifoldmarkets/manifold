import clsx from 'clsx'
import { Contract } from 'common/contract'
import { Group } from 'common/group'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getGroupContractIds } from 'web/lib/supabase/group'
import { SelectMarkets } from '../contract-select-modal'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { UncontrolledTabs } from '../layout/tabs'
import { NewContractPanel } from '../new-contract-panel'
import { groupRoleType } from './group-member-modal'

export function AddMarketToGroupModal(props: {
  group: Group
  user: User
  open: boolean
  setOpen: (open: boolean) => void
  onAddMarkets: (contracts: Contract[]) => void | Promise<void>
  userRole?: groupRoleType
}) {
  const { group, user, open, setOpen, onAddMarkets, userRole } = props
  const [groupContractIds, setGroupContractIds] = useState<string[]>([])
  useEffect(() => {
    getGroupContractIds(group.id).then((ids) =>
      setGroupContractIds(ids.map((contractId: any) => contractId.contract_id))
    )
  }, [group.id])
  return (
    <Modal open={open} setOpen={setOpen} size="lg">
      <Col className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}>
        <div className="fixed inset-x-0 top-0 z-40 w-full rounded-t-md bg-indigo-100 py-2 px-8 text-indigo-800">
          {group.name}
        </div>
        {group.privacyStatus == 'public' &&
          userRole != 'admin' &&
          userRole != 'moderator' && (
            <Col className="w-full pt-4">
              <NewContractFromGroup group={group} user={user} />
            </Col>
          )}
        {(userRole === 'admin' || userRole === 'moderator') && (
          <Col className="-mt-1 w-full pt-4">
            <UncontrolledTabs
              tabs={[
                {
                  title: 'New market',
                  content: <NewContractFromGroup group={group} user={user} />,
                },
                {
                  title: 'Existing market',
                  content: (
                    <SelectMarkets
                      submitLabel={(len) =>
                        `Add ${len} question${len !== 1 ? 's' : ''}`
                      }
                      onSubmit={onAddMarkets}
                      setOpen={setOpen}
                      additionalFilter={{
                        excludeContractIds: groupContractIds,
                      }}
                      headerClassName="top-[6px]"
                    />
                  ),
                },
              ]}
              className="sticky top-4 z-40 bg-white"
            />
          </Col>
        )}
      </Col>
    </Modal>
  )
}

export function NewContractFromGroup(props: { group: Group; user: User }) {
  const { group, user } = props
  return (
    <NewContractPanel
      params={{
        q: '',
        type: 'BINARY',
        description: '',
        closeTime: '',
        outcomeType: 'BINARY',
        visibility: 'public',
        groupId: group.id,
      }}
      creator={user}
      fromGroup={true}
    />
  )
}

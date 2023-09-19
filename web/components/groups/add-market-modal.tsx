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
import { NewContractPanel } from '../new-contract/new-contract-panel'
import { AddContractToGroupPermissionType } from './add-contract-to-group-modal'
import { NewQuestionParams } from 'web/components/new-contract/new-contract-panel'
import { DAY_MS } from 'common/util/time'

export function AddMarketToGroupModal(props: {
  group: Group
  user: User
  open: boolean
  setOpen: (open: boolean) => void
  onAddMarkets: (contracts: Contract[]) => void | Promise<void>
  addPermission: AddContractToGroupPermissionType
}) {
  const { group, user, open, setOpen, onAddMarkets, addPermission } = props
  const [groupContractIds, setGroupContractIds] = useState<string[]>([])
  useEffect(() => {
    getGroupContractIds(group.id).then((ids) => setGroupContractIds(ids))
  }, [group.id])
  return (
    <Modal open={open} setOpen={setOpen} size="lg">
      <Col className="bg-canvas-0 gap-4 overflow-hidden rounded-md">
        <div className="bg-primary-100 text-primary-800 py-2 px-8">
          Add questions to {group.name}
        </div>
        {addPermission == 'private' && (
          <Col className="w-full">
            <NewContractFromGroup group={group} user={user} />
          </Col>
        )}
        {addPermission == 'new' && (
          <Col className="w-full">
            <NewContractFromGroup group={group} user={user} />
          </Col>
        )}
        {addPermission == 'any' && (
          <Col className="-mt-1 w-full">
            <UncontrolledTabs
              tabs={[
                {
                  title: 'New question',
                  content: <NewContractFromGroup group={group} user={user} />,
                },
                {
                  title: 'Existing question',
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
                      className={clsx(SCROLLABLE_MODAL_CLASS, 'w-full !px-4')}
                      headerClassName="!bg-canvas-0"
                    />
                  ),
                },
              ]}
              className="px-4"
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
      params={
        {
          q: '',
          description: '',
          closeTime: Date.now() + 7 * DAY_MS,
          visibility: group.privacyStatus === 'private' ? 'private' : 'public',
          groupIds: [group.id],
        } as NewQuestionParams
      }
      creator={user}
    />
  )
}

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
import { AddContractToGroupPermissionType } from './add-contract-to-group-button'

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
  const [theme, setTheme] = useState<'private' | 'non-private'>(
    group.privacyStatus == 'private' ? 'private' : 'non-private'
  )
  return (
    <Modal open={open} setOpen={setOpen} size="lg">
      <Col
        className={clsx(
          MODAL_CLASS,
          SCROLLABLE_MODAL_CLASS,
          theme == 'private' ? 'bg-primary-100' : 'bg-canvas-0'
        )}
      >
        <div className="bg-primary-100 text-primary-800 fixed inset-x-0 top-0 z-40 w-full rounded-t-md py-2 px-8">
          {group.name}
        </div>
        {addPermission == 'private' && (
          <Col className="w-full pt-4">
            <NewContractFromGroup
              group={group}
              user={user}
              setTheme={setTheme}
            />
          </Col>
        )}
        {addPermission == 'new' && (
          <Col className="w-full pt-4">
            <NewContractFromGroup
              group={group}
              user={user}
              setTheme={setTheme}
            />
          </Col>
        )}
        {addPermission == 'any' && (
          <Col className="-mt-1 w-full pt-4">
            <UncontrolledTabs
              tabs={[
                {
                  title: 'New question',
                  content: (
                    <NewContractFromGroup
                      group={group}
                      user={user}
                      setTheme={setTheme}
                    />
                  ),
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
                      headerClassName="top-[6px]"
                    />
                  ),
                },
              ]}
              className="bg-canvas-0 sticky top-4 z-40"
            />
          </Col>
        )}
      </Col>
    </Modal>
  )
}

export function NewContractFromGroup(props: {
  group: Group
  user: User
  setTheme: (theme: 'private' | 'non-private') => void
}) {
  const { group, user, setTheme } = props
  return (
    <NewContractPanel
      params={{
        q: '',
        type: 'BINARY',
        description: '',
        closeTime: '',
        outcomeType: 'BINARY',
        visibility: group.privacyStatus === 'private' ? 'private' : 'public',
        groupId: group.id,
      }}
      creator={user}
      fromGroup={true}
      setTheme={setTheme}
    />
  )
}

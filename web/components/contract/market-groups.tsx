import { Contract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import {
  useGroupsWhereUserHasRole,
  useGroupsWithContract,
} from 'web/hooks/use-group-supabase'
import { orderBy } from 'lodash'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { GroupTag } from 'web/pages/groups'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { useAdmin } from 'web/hooks/use-admin'
import { isTrustworthy } from 'common/envs/constants'
import { groups } from 'd3-array'
import { filterDefined } from 'common/util/array'
import { Group } from 'common/group'

export function MarketGroups(props: { contract: Contract }) {
  const { contract } = props
  if (contract.visibility === 'private') {
    return <PrivateMarketGroups contract={contract} />
  } else {
    return <PublicMarketGroups contract={contract} />
  }
}

function PrivateMarketGroups(props: { contract: Contract }) {
  const { contract } = props
  if (contract.groupLinks) {
    return (
      <div className="flex">
        <GroupTag group={contract.groupLinks[0]} isPrivate />
      </div>
    )
  }
  return <></>
}

const ContractGroupBreadcrumbs = (props: { contract: Contract }) => {
  const { contract } = props
  const { groupLinks } = contract
  const groups = orderBy(
    useGroupsWithContract(contract) ?? [],
    // boost public groups
    (g) => (g.privacyStatus === 'public' ? 100 : 0) + g.totalMembers,
    'desc'
  )

  return (
    <Row
      className={clsx(
        'line-clamp-1',
        (groupLinks?.length ?? 0) > 0 ? 'h-5' : 'h-0'
      )}
    >
      {groups.map((group, i) => (
        <span key={group.id} className={'text-primary-600 text-sm'}>
          <Link className={clsx(linkClass)} href={`/group/${group.slug}`}>
            {group.name}
          </Link>
          {i !== groups.length - 1 && <span className="mx-1">{'•'}</span>}
        </span>
      ))}
    </Row>
  )
}

export function PublicMarketGroups(props: { contract: Contract }) {
  const [open, setOpen] = useState(false)
  const { contract } = props
  const user = useUser()
  const isCreator = contract.creatorId === user?.id
  const adminGroups = useGroupsWhereUserHasRole(user?.id)
  const isAdmin = useAdmin()
  const trust = isTrustworthy(user?.username)

  const canEdit =
    isAdmin || isCreator || trust || (adminGroups && adminGroups.length > 0)
  const onlyGroups = !isAdmin && !isCreator && !trust ? adminGroups : undefined

  const canEditGroup = (group: Group) =>
    isCreator ||
    trust ||
    isAdmin ||
    // if user has admin role in that group
    !!(adminGroups && adminGroups.some((g) => g.group_id === group.id))
  return (
    <>
      <Row className={'gap-1'}>
        <ContractGroupBreadcrumbs contract={contract} />
        {user && canEdit && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
            className="hover:bg-primary-400/20 text-primary-700 rounded-sm text-sm"
          >
            {groups.length ? (
              <PencilIcon className="h-6 w-6 px-1" />
            ) : (
              <span className={clsx('flex items-center py-0.5 px-1')}>
                <PlusIcon className="mr-1 h-4 w-4" /> Category
              </span>
            )}
          </button>
        )}
      </Row>
      <Modal open={open} setOpen={setOpen} size={'md'}>
        <Col
          className={
            'bg-canvas-0 max-h-[70vh] min-h-[20rem] overflow-auto rounded p-6'
          }
        >
          <ContractGroupsList
            canEdit={!!canEdit}
            contract={contract}
            user={user}
            onlyGroupIds={
              onlyGroups
                ? filterDefined(onlyGroups.map((g) => g.group_id))
                : undefined
            }
            canEditGroup={canEditGroup}
          />
        </Col>
      </Modal>
    </>
  )
}

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
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractGroupsList } from 'web/components/groups/contract-groups-list'
import { useAdmin } from 'web/hooks/use-admin'
import { isTrustworthy } from 'common/envs/constants'
import { filterDefined } from 'common/util/array'
import { Group } from 'common/group'
import { track } from 'web/lib/service/analytics'
import { removeEmojis } from 'common/topics'
import { CategoryTag } from 'web/components/groups/category-tag'

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
        <CategoryTag
          location={'market page'}
          category={contract.groupLinks[0]}
          isPrivate
        />
      </div>
    )
  }
  return <></>
}

const ContractGroupBreadcrumbs = (props: { contract: Contract }) => {
  const { contract } = props
  const groups = orderBy(
    useGroupsWithContract(contract) ?? [],
    // boost public groups
    (g) => (g.privacyStatus === 'public' ? 100 : 0) + g.totalMembers,
    'desc'
  )

  return (
    <Row className={clsx('line-clamp-1')}>
      {groups.map((group, i) => (
        <span key={group.id} className={'text-primary-600 text-sm'}>
          <Link
            className={linkClass}
            href={`/group/${group.slug}`}
            onClick={() => {
              track('click category pill on market', {
                contractId: contract.id,
                categoryName: group.name,
              })
            }}
          >
            {removeEmojis(group.name)}
          </Link>
          {i !== groups.length - 1 && (
            <span className="mx-1 inline-block w-2">{'•'}</span>
          )}
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
      <Row className={'group h-6 gap-1'}>
        <ContractGroupBreadcrumbs contract={contract} />
        {user && canEdit && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
            className="hover:bg-primary-400/20 text-primary-700 rounded-md text-sm sm:hidden sm:group-hover:inline"
          >
            {contract.groupLinks?.length ? (
              <PencilIcon className="w-6 px-1" />
            ) : (
              <span className={clsx('flex items-center px-1 text-sm')}>
                <PlusIcon className="mr-1 h-3 " /> Categories
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

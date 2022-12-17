import { IconButton } from 'web/components/buttons/button'
import {
  Contract,
  followContract,
  unFollowContract,
} from 'web/lib/firebase/contracts'
import toast from 'react-hot-toast'
import { CheckIcon, EyeIcon, EyeOffIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { useContractFollows } from 'web/hooks/use-follows'
import { firebaseLogin, updateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Tooltip } from '../widgets/tooltip'

export const FollowMarketButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const followers = useContractFollows(contract.id)
  const [open, setOpen] = useState(false)

  const watching = followers?.includes(user?.id ?? 'nope')

  return (
    <Tooltip
      text={watching ? 'Unfollow' : 'Follow'}
      placement="bottom"
      noTap
      noFade
    >
      <IconButton
        size="2xs"
        onClick={async () => {
          if (!user) return firebaseLogin()
          if (followers?.includes(user.id)) {
            unfollowMarket(contract.id, contract.slug, user)
          } else {
            followMarket(contract.id, contract.slug, user)
          }
          if (!user.hasSeenContractFollowModal) {
            await updateUser(user.id, {
              hasSeenContractFollowModal: true,
            })
            setOpen(true)
          }
        }}
      >
        {watching ? (
          <Col className={'items-center gap-x-2 sm:flex-row'}>
            <EyeOffIcon className={clsx('h-5 w-5')} aria-hidden="true" />
            {/* Unwatch */}
          </Col>
        ) : (
          <Col className={'items-center gap-x-2 sm:flex-row'}>
            <EyeIcon className={clsx('h-5 w-5')} aria-hidden="true" />
            {/* Watch */}
          </Col>
        )}
        <WatchMarketModal
          open={open}
          setOpen={setOpen}
          title={`You ${
            followers?.includes(user?.id ?? 'nope') ? 'watched' : 'unwatched'
          } a question!`}
        />
      </IconButton>
    </Tooltip>
  )
}

export async function unfollowMarket(
  contractId: string,
  contractSlug: string,
  user: User
) {
  await unFollowContract(contractId, user.id)
  toast("You'll no longer receive notifications from this market", {
    icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
  })
  track('Unwatch Market', {
    slug: contractSlug,
  })
}

export async function followMarket(
  contractid: string,
  contractslug: string,
  user: User
) {
  await followContract(contractid, user.id)
  toast("You'll now receive notifications from this market!", {
    icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
  })
  track('Watch Market', {
    slug: contractslug,
  })
}

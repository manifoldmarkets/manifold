import { CheckIcon, EyeIcon, EyeOffIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { Row } from 'web/components/layout/row'
import {
  Contract,
  followContract,
  unFollowContract,
} from 'web/lib/firebase/contracts'
import { firebaseLogin, updateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'

export const FollowMarketButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const [following, setFollowing] = useState<boolean>()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    db.from('contract_follows')
      .select('contract_id')
      .eq('follow_id', user.id)
      .eq('contract_id', contract.id)
      .then((res) => {
        setFollowing((res.data?.length ?? 0) > 0)
      })
  }, [user?.id, open])
  return (
    <Button
      loading={following === undefined}
      size="sm"
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (following) {
          unfollowMarket(contract.id, contract.slug, user).then(() =>
            setFollowing(false)
          )
        } else {
          followMarket(contract.id, contract.slug, user).then(() =>
            setFollowing(true)
          )
        }
        if (!user.hasSeenContractFollowModal) {
          await updateUser(user.id, {
            hasSeenContractFollowModal: true,
          })
          setOpen(true)
        }
      }}
    >
      {following ? (
        <Row className={'items-center gap-x-2 sm:flex-row'}>
          <EyeOffIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Unwatch
        </Row>
      ) : (
        <Row className={'items-center gap-x-2 sm:flex-row'}>
          <EyeIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Watch
        </Row>
      )}
      <WatchMarketModal
        open={open}
        setOpen={setOpen}
        title={`You ${following ? 'watched' : 'unwatched'} a question!`}
      />
    </Button>
  )
}

export async function unfollowMarket(
  contractId: string,
  contractSlug: string,
  user: User
) {
  await unFollowContract(contractId, user.id)
  toast("You'll no longer receive notifications from this question", {
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
  toast("You'll now receive notifications from this question!", {
    icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
  })
  track('Watch Market', {
    slug: contractslug,
  })
}

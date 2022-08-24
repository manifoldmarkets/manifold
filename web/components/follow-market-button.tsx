import { Button } from 'web/components/button'
import {
  Contract,
  followContract,
  unFollowContract,
} from 'web/lib/firebase/contracts'
import toast from 'react-hot-toast'
import { CheckIcon, HeartIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { useContractFollows } from 'web/hooks/use-follows'
import { firebaseLogin, updateUser } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { FollowMarketModal } from 'web/components/contract/follow-market-modal'
import { useState } from 'react'

export const FollowMarketButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const followers = useContractFollows(contract.id)
  const [open, setOpen] = useState(false)

  return (
    <Button
      size={'lg'}
      color={'gray-white'}
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (followers?.includes(user.id)) {
          await unFollowContract(contract.id, user.id)
          toast('Notifications from this market are now silenced.', {
            icon: <CheckIcon className={'text-primary h-5 w-5'} />,
          })
          track('Unfollow Market', {
            slug: contract.slug,
          })
        } else {
          await followContract(contract.id, user.id)
          toast('You are now following this market!', {
            icon: <CheckIcon className={'text-primary h-5 w-5'} />,
          })
          track('Follow Market', {
            slug: contract.slug,
          })
        }
        if (!user.hasSeenContractFollowModal) {
          await updateUser(user.id, {
            hasSeenContractFollowModal: true,
          })
          setOpen(true)
        }
      }}
    >
      {followers?.includes(user?.id ?? 'nope') ? (
        <HeartIcon
          className={clsx('h-6 w-6  fill-red-600 stroke-red-600 xl:h-7 xl:w-7')}
          aria-hidden="true"
        />
      ) : (
        <HeartIcon
          className={clsx('h-6 w-6 xl:h-7 xl:w-7')}
          aria-hidden="true"
        />
      )}
      <FollowMarketModal
        open={open}
        setOpen={setOpen}
        title={`You ${
          followers?.includes(user?.id ?? 'nope') ? 'followed' : 'unfollowed'
        } a question!`}
      />
    </Button>
  )
}

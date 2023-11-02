import { CheckIcon } from '@heroicons/react/outline'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'
import { Contract } from 'web/lib/firebase/contracts'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { followContract, unfollowContract } from 'common/supabase/contracts'
import { FaBookmark, FaRegBookmark } from 'react-icons/fa6'
import { Tooltip } from '../widgets/tooltip'
import { getContractFollows } from 'web/lib/supabase/follows'

export const FollowMarketButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const [follows, setFollows] = useState<string[]>([])
  const following = user && follows.includes(user.id)
  const count = follows.length

  useEffect(() => {
    if (!user?.id) return
    getContractFollows(contract.id).then(setFollows)
  }, [user?.id, open])

  if (user === null) return null

  return (
    <Tooltip text={following ? 'Remove bookmark' : 'Bookmark'}>
      <Button
        color="gray-white"
        loading={following === undefined}
        onClick={async () => {
          if (!user) return firebaseLogin()
          if (following) {
            setFollows(follows?.filter((f) => f !== user.id))
            unfollowMarket(contract.id, contract.slug, user)
          } else {
            setFollows([...(follows ?? []), user.id])
            followMarket(contract.id, contract.slug, user)
          }
        }}
      >
        {following ? (
          <FaBookmark className={'h-5 w-5 text-yellow-500'} />
        ) : (
          <FaRegBookmark className={'h-5 w-5'} />
        )}
        {count && <span className="text-ink-500 ml-1">{count}</span>}
      </Button>
    </Tooltip>
  )
}

export async function unfollowMarket(
  contractId: string,
  contractSlug: string,
  user: User
) {
  await unfollowContract(db, contractId, user.id)
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
  await followContract(db, contractid, user.id)
  toast("You'll now receive notifications from this question!", {
    icon: <CheckIcon className={'h-5 w-5 text-teal-500'} />,
  })
  track('Watch Market', {
    slug: contractslug,
  })
}

import { BookmarkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, IconButton } from 'web/components/buttons/button'
import { WatchMarketModal } from 'web/components/contract/watch-market-modal'
import { Row } from 'web/components/layout/row'
import { Contract } from 'common/contract'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { db } from 'web/lib/supabase/db'
import { api } from 'web/lib/api/api'
import { BookmarkIcon as FilledBookmarkIcon } from '@heroicons/react/solid'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'

export const FollowMarketButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  const { following, setFollowing } = useIsWatching(contract, user)

  return (
    <Button
      size="sm"
      color="indigo-outline"
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (following) {
          unfollowMarket(contract.id, contract.slug).then(() =>
            setFollowing(false)
          )
        } else {
          followMarket(contract.id, contract.slug).then(() =>
            setFollowing(true)
          )
        }
        if (!user.hasSeenContractFollowModal) {
          await api('me/update', { hasSeenContractFollowModal: true })
          setOpen(true)
        }
      }}
    >
      {following ? (
        <Row className={'items-center gap-x-2'}>
          <FilledBookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Unfollow
        </Row>
      ) : (
        <Row className={'items-center gap-x-2'}>
          <BookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
          Follow
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
export const FollowMarketIconButton = (props: {
  contract: Contract
  user: User | undefined | null
}) => {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  const { following, setFollowing } = useIsWatching(contract, user)

  return (
    <IconButton
      size="xs"
      onClick={async () => {
        if (!user) return firebaseLogin()
        if (following) {
          unfollowMarket(contract.id, contract.slug).then(() =>
            setFollowing(false)
          )
        } else {
          followMarket(contract.id, contract.slug).then(() =>
            setFollowing(true)
          )
        }
        if (!user.hasSeenContractFollowModal) {
          await api('me/update', { hasSeenContractFollowModal: true })
          setOpen(true)
        }
      }}
    >
      {following ? (
        <FilledBookmarkIcon className={clsx('h-5 w-5')} aria-hidden="true" />
      ) : (
        <BookmarkIcon
          strokeWidth={2.5}
          className={clsx('h-5 w-5')}
          aria-hidden="true"
        />
      )}
      <WatchMarketModal
        open={open}
        setOpen={setOpen}
        title={`You ${following ? 'watched' : 'unwatched'} a question!`}
      />
    </IconButton>
  )
}

const useIsWatching = (contract: Contract, user: User | undefined | null) => {
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    if (!user) return
    db.from('contract_follows')
      .select('contract_id')
      .eq('follow_id', user.id)
      .eq('contract_id', contract.id)
      .then((res) => {
        setFollowing((res.data?.length ?? 0) > 0)
      })
  }, [user?.id, contract.id, user?.lastBetTime])

  useApiSubscription({
    topics: [`contract-follow/${contract.id}`],
    onBroadcast: (msg) => {
      if (msg.data.followerId === user?.id) {
        setFollowing(msg.data.follow as boolean)
      }
    },
    enabled: !!user,
  })

  return { following, setFollowing }
}

export async function unfollowMarket(contractId: string, contractSlug: string) {
  await toast.promise(api('follow-contract', { contractId, follow: false }), {
    loading: 'Unfollowing...',
    success: "You'll no longer receive notifications from this question",
    error: 'Failed to unfollow',
  })
  track('Unwatch Market', {
    slug: contractSlug,
  })
}

export async function followMarket(contractId: string, contractslug: string) {
  await toast.promise(api('follow-contract', { contractId, follow: true }), {
    loading: 'Following...',
    success: "You'll now receive notifications from this question!",
    error: 'Failed to follow',
  })
  track('Watch Market', {
    slug: contractslug,
  })
}

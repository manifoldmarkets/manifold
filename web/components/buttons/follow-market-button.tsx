import { BookmarkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { User } from 'common/user'
import { SetStateAction, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, IconButton } from 'web/components/buttons/button'
import { FollowMarketModal } from 'web/components/contract/follow-market-modal'
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
      color="gray-outline"
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
        <Row className="items-center gap-1.5">
          <FilledBookmarkIcon className="h-4 w-4" aria-hidden="true" />
          Unfollow
        </Row>
      ) : (
        <Row className="items-center gap-1.5">
          <BookmarkIcon className="h-4 w-4" aria-hidden="true" />
          Follow
        </Row>
      )}
      <FollowMarketModal
        open={open}
        setOpen={setOpen}
        title={`You ${following ? 'followed' : 'unfollowed'} a question!`}
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
      aria-label={following ? 'Unfollow market' : 'Follow market'}
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
      <FollowMarketModal
        open={open}
        setOpen={setOpen}
        title={`You ${following ? 'followed' : 'unfollowed'} a question!`}
      />
    </IconButton>
  )
}

const useIsWatching = (contract: Contract, user: User | undefined | null) => {
  const [following, setFollowing] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    if (!user) return
    const request = ++generation.current
    db.from('contract_follows')
      .select('contract_id')
      .eq('follow_id', user.id)
      .eq('contract_id', contract.id)
      .then((res) => {
        if (request === generation.current)
          setFollowing((res.data?.length ?? 0) > 0)
      })
    return () => {
      generation.current++
    }
  }, [user?.id, contract.id, user?.lastBetTime])

  useApiSubscription({
    topics: [`contract-follow/${contract.id}`],
    recoveryKey: user?.id,
    getSnapshot: async () => {
      const request = ++generation.current
      const { data, error } = await db
        .from('contract_follows')
        .select('contract_id')
        .eq('follow_id', user!.id)
        .eq('contract_id', contract.id)
      if (error) throw error
      return () => {
        if (request !== generation.current) return false
        setFollowing((data?.length ?? 0) > 0)
      }
    },
    onBroadcast: (msg) => {
      if (msg.data.followerId === user?.id) {
        generation.current++
        setFollowing(msg.data.follow as boolean)
      }
    },
    enabled: !!user,
  })

  return {
    following,
    setFollowing: (value: SetStateAction<boolean>) => {
      generation.current++
      setFollowing(value)
    },
  }
}

export async function unfollowMarket(contractId: string, contractSlug: string) {
  await toast.promise(api('follow-contract', { contractId, follow: false }), {
    loading: 'Unfollowing...',
    success: 'Unfollowed market!',
    error: 'Failed to unfollow',
  })
  track('Unwatch Market', {
    slug: contractSlug,
  })
}

export async function followMarket(contractId: string, contractslug: string) {
  await toast.promise(api('follow-contract', { contractId, follow: true }), {
    loading: 'Following...',
    success: 'Followed market!',
    error: 'Failed to follow',
  })
  track('Watch Market', {
    slug: contractslug,
  })
}

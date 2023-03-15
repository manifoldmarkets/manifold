import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { useEffect, useReducer, useState } from 'react'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import {
  getAllAds,
  getSkippedAdIds,
  getWatchedAdIds,
} from 'web/lib/supabase/ads'
import type { Ad as AdType } from 'common/src/ad'
import { Content } from 'web/components/widgets/editor'
import { useCommentsOnPost } from 'web/hooks/use-comments'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { PostCommentsActivity } from '../post/[slug]'
import { UserLink } from 'web/components/widgets/user-link'
import { redeemAd } from 'web/lib/firebase/api'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { track } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import clsx from 'clsx'

export async function getStaticProps() {
  const ads = await getAllAds()
  return { props: { ads }, revalidate: 60 }
}

export default function AdsPage(props: { ads: AdType[] }) {
  const user = useUser()

  const [oldAdIds, setOldAdIds] = useState<string[]>()
  useEffect(() => {
    if (user) {
      Promise.all([getWatchedAdIds(user.id), getSkippedAdIds(user.id)]).then(
        ([watched, skipped]) => setOldAdIds(uniq(watched.concat(skipped)))
      )
    }
  }, [user?.id])

  const isLoading = oldAdIds == undefined
  const newAds = props.ads.filter((ad) => !oldAdIds?.includes(ad.id))

  const [i, next] = useReducer((num) => num + 1, 0)
  const current = newAds[i]

  return (
    <Page>
      <NoSEO />
      {isLoading && <LoadingIndicator />}

      {!isLoading && (
        <>
          {current ? (
            <Ad ad={current} onNext={next} key={current.id} />
          ) : (
            <>
              <span className="w-full py-4 text-center">No more ads</span>
              <CreateBanner />
            </>
          )}
        </>
      )}
    </Page>
  )
}

function Ad(props: { ad: AdType; onNext: () => void }) {
  const { ad, onNext } = props

  const comments = useCommentsOnPost(ad.id) ?? []
  const tips = useTipTxns({ postId: ad.id })

  return (
    <div className="flex w-full max-w-2xl flex-col self-center">
      <div className="bg-canvas-0 rounded-lg p-4 sm:p-6">
        <Content size="lg" content={ad.content} />
      </div>

      <div className="mx-4 mt-1 mb-4">
        <span className="text-ink-500 mr-1">Created by</span>
        <UserLink username={ad.creatorUsername} name={ad.creatorName} />
      </div>

      <TimerClaimBox ad={ad} onNext={onNext} className="my-5" />

      <PostCommentsActivity post={ad} comments={comments} tips={tips} />

      <div className="h-8" />
      <CreateBanner />
    </div>
  )
}

const WAIT_TIME = 15 // 15 sec

export const TimerClaimBox = (props: {
  ad: AdType
  onNext: () => void
  className?: string
}) => {
  const { ad, onNext, className } = props

  const skip = () => {
    track('Skip ad', { adId: ad.id })
    onNext()
  }

  const claim = async () => {
    track('Redeem ad', { adId: ad.id })
    redeemAd({ adId: ad.id })
    onNext()
  }

  const counter = useCounter()
  const timeLeft = WAIT_TIME - counter
  return (
    <div
      className={clsx(
        'to-primary-400 relative flex w-full justify-center overflow-hidden rounded-md bg-yellow-200 bg-gradient-to-r from-pink-300 via-purple-300',
        className
      )}
    >
      {timeLeft < 0 ? (
        <button
          onClick={claim}
          className="flex w-full justify-center p-6 transition-colors hover:bg-slate-900/20"
        >
          Claim {formatMoney(ad.costPerView)} and continue
        </button>
      ) : (
        <>
          <TimerBar duration={WAIT_TIME} />
          <div className="z-10 flex w-full items-center justify-between py-4 px-6">
            <span>
              Claim {formatMoney(ad.costPerView)} in {timeLeft + 1} seconds
            </span>
            <Button color="red" onClick={skip}>
              Skip
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

const useCounter = () => {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((sec) => sec + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  return elapsed
}

const TimerBar = (props: { duration: number }) => {
  const { duration } = props

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      <div
        className="animate-progress"
        style={{ animationDuration: `${duration}s` }}
      />
      <div className="bg-canvas-0 grow" />
    </div>
  )
}

const CreateBanner = () => (
  <Link
    href="/ad/create"
    className={clsx(buttonClass('xl', 'indigo'), 'self-center')}
  >
    Create your own advertisement!
  </Link>
)

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
import { UserLink } from 'web/components/widgets/user-link'
import { APIError, redeemAd } from 'web/lib/firebase/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { track } from 'web/lib/service/analytics'
import { uniq } from 'lodash'
import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { postPath } from 'web/lib/supabase/post'
import toast from 'react-hot-toast'
import { useUser } from 'web/hooks/use-user'

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
  const newAds = props.ads

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
              {/* <CreateBanner /> */}
            </>
          )}
        </>
      )}
    </Page>
  )
}

function Ad(props: { ad: AdType; onNext: () => void }) {
  const { ad, onNext } = props

  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(ad.slug)}`

  return (
    <div className="flex w-full max-w-2xl flex-col self-center">
      <div className="bg-canvas-0 rounded-lg p-4 sm:p-6">
        <Content size="lg" content={ad.content} />
      </div>

      <div className="mx-4 mt-1 mb-4 flex justify-between">
        <div>
          <span className="text-ink-500 mr-1">Created by</span>
          <UserLink username={ad.creatorUsername} name={ad.creatorName} />
        </div>
        <CopyLinkOrShareButton
          url={shareUrl}
          tooltip="Copy link to ad"
          eventTrackingName={'copy ad link'}
        />
      </div>

      <TimerClaimBox ad={ad} onNext={onNext} className="my-5" />

      {/* <div className="h-8" />
      <CreateBanner /> */}
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
    redeemAd({ adId: ad.id })
      .catch((e: APIError) => toast.error(e.message))
      .then(() => track('Redeem ad', { adId: ad.id }))

    onNext()
  }

  const counter = useCounter()
  const timeLeft = WAIT_TIME - counter
  return (
    <div
      className={clsx(
        'relative flex w-full justify-center overflow-hidden rounded-md',
        className
      )}
    >
      {timeLeft < 0 ? (
        <button
          onClick={claim}
          className="to-primary-400 bg-primary-700 flex w-full justify-center bg-gradient-to-r from-pink-300 via-purple-300 p-6 transition-all hover:opacity-80 dark:from-pink-600"
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
    <div className="bg-canvas-0 absolute inset-0 flex overflow-hidden">
      <div
        className="animate-progress bg-canvas-100"
        style={{ animationDuration: `${duration}s` }}
      />
    </div>
  )
}

export const CreateBanner = () => (
  <Link
    href="/ad/create"
    className={clsx(buttonClass('xl', 'indigo'), 'self-center')}
  >
    Create your own advertisement!
  </Link>
)

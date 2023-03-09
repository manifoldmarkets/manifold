import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { useEffect, useReducer, useState } from 'react'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { getAllAds } from 'web/lib/supabase/posts'
import type { Ad as AdType } from 'common/src/ad'
import { Content } from 'web/components/widgets/editor'
import { useCommentsOnPost } from 'web/hooks/use-comments'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { PostCommentsActivity } from '../post/[slug]'

export async function getStaticProps() {
  const ads = await getAllAds()
  return { props: { ads } }
}

export default function AdsPage(props: { ads: AdType[] }) {
  const [i, next] = useReducer((num) => num + 1, 0)

  const current = props.ads[i]

  return (
    <Page>
      <NoSEO />
      {current ? (
        <Ad ad={current} onNext={next} onClaim={next} key={current.id} />
      ) : (
        <>
          <span className="w-full py-4 text-center">No more ads</span>
          <CreateBanner />
        </>
      )}
    </Page>
  )
}

const WAIT_TIME = 15 // 15 sec

function Ad(props: { ad: AdType; onNext: () => void; onClaim: () => void }) {
  const { ad, onNext, onClaim } = props
  const { costPerView, content } = ad

  const counter = useCounter()
  const timeLeft = WAIT_TIME - counter

  const comments = useCommentsOnPost(ad.id) ?? []
  const tips = useTipTxns({ postId: ad.id })

  return (
    <div className="flex flex-col">
      {/* post */}
      <div className="bg-canvas-0 p-6">
        <Content size="lg" content={content} />
      </div>

      {/* timer claim box */}
      <div className="to-primary-400 relative my-5 flex w-full justify-center rounded-md bg-yellow-200 bg-gradient-to-r from-pink-300 via-purple-300 p-4">
        <div className="flex w-full items-center justify-between md:w-[400px]">
          {timeLeft < 0 ? (
            <Button
              onClick={onClaim}
              color="gradient"
              className="outline-canvas-0 w-full outline"
            >
              Claim {formatMoney(costPerView)} and continue
            </Button>
          ) : (
            <>
              <span className="z-10">
                Claim {formatMoney(costPerView)} in {timeLeft + 1} seconds
              </span>
              <Button
                color="override"
                className="hover:bg-ink-500/50 z-10 shadow-none"
                onClick={onNext}
              >
                Skip
              </Button>
              <TimerBar duration={WAIT_TIME} />
            </>
          )}
        </div>
      </div>

      {/* comments */}
      <PostCommentsActivity post={ad} comments={comments} tips={tips} />

      <div className="h-8" />
      <CreateBanner />
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
    <div className="absolute inset-0 flex overflow-hidden rounded-t-md">
      <div
        className="animate-progress"
        style={{
          animationDuration: `${duration}s`,
        }}
      />
      <div className="grow bg-slate-900/20" />
    </div>
  )
}

const CreateBanner = () => (
  <Link href="/ad/create" className={buttonClass('xl', 'indigo')}>
    Create your own advertisement!
  </Link>
)

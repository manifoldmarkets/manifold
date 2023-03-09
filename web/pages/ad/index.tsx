import clsx from 'clsx'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { useEffect, useReducer, useState } from 'react'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'

export default function AdsPage() {
  const [num, bump] = useReducer((num) => num + 1, 0)

  return (
    <Page>
      <NoSEO />
      <Ad viewReward={200} key={num} onNext={bump} onClaim={bump} />
    </Page>
  )
}

const WAIT_TIME = 15 // 15 sec

function Ad(props: {
  viewReward: number
  onNext: () => void
  onClaim: () => void
}) {
  const { viewReward, onNext, onClaim } = props

  const counter = useCounter()
  const timeLeft = WAIT_TIME - counter

  return (
    <div className="flex flex-col">
      {/* post */}
      <div className="flex h-0.5 flex-col bg-white">
        <p>Imagine all the content ... everywhen</p>
      </div>

      {/* timer claim box */}
      <div className="relative mt-5 flex w-full items-center justify-between self-center rounded-md bg-yellow-200 p-4 md:w-[400px]">
        {timeLeft < 0 ? (
          <Button onClick={onClaim} color="yellow" className="w-full">
            Claim {formatMoney(viewReward)} and continue
          </Button>
        ) : (
          <>
            <span>
              Claim {formatMoney(viewReward)} in {timeLeft + 1} seconds
            </span>
            <Button color="gray-white" onClick={onNext}>
              Skip
            </Button>
            <TimerBar duration={WAIT_TIME} />
          </>
        )}
      </div>

      {/* comments */}

      <Link
        href="/ad/create"
        className={clsx(buttonClass('md', 'gradient'), 'bg-gradient-to-r')}
      >
        Create your own advertisement!
      </Link>
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
    <div className="absolute top-0 left-0 right-0 h-2 overflow-hidden rounded-t-md">
      <div
        className="animate-progress h-full bg-green-500"
        style={{
          animationDuration: `${duration}s`,
        }}
      />
    </div>
  )
}

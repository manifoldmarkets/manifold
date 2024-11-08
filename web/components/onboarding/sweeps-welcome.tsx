import Image from 'next/image'
import { formatMoney, SWEEPIES_MONIKER } from 'common/util/format'
import { STARTING_BALANCE } from 'common/economy'
import { capitalize } from 'lodash'
import {
  ENV_CONFIG,
  SWEEPIES_NAME,
  TRADE_TERM,
  TRADING_TERM,
} from 'common/envs/constants'
import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { updateUser } from 'web/lib/api/api'
import { randomString } from 'common/util/random'
import { Input } from '../widgets/input'
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/solid'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { ManaCoin } from 'web/public/custom-components/manaCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'

import clsx from 'clsx'
import { ManaFlatCoin } from 'web/public/custom-components/manaFlatCoin'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'

export function SweepsWelcomePage() {
  const user = useUser()

  const [name, setName] = useState<string>(user?.name ?? 'friend')
  useEffect(() => {
    if (user?.name) setName(user.name)
  }, [user?.name === undefined])

  const saveName = async () => {
    let newName = cleanDisplayName(name)
    if (!newName) newName = 'Name'
    if (newName === user?.name) return
    setName(newName)

    await updateUser({ name: newName })

    let username = cleanUsername(newName)
    try {
      await updateUser({ username })
    } catch (e) {
      username += randomString(5)
      await updateUser({ username })
    }
  }

  const [usernameHover, setUsernameHover] = useState(false)

  return (
    <>
      <Row className=" text-primary-700 mb-6 mt-2 h-10 gap-2 text-center text-2xl font-normal">
        <div className="mt-1">Welcome,</div>
        <Row
          className="items-center gap-1"
          onMouseEnter={() => setUsernameHover(true)}
          onMouseLeave={() => setUsernameHover(false)}
        >
          <input
            type="text"
            placeholder="Name"
            value={name}
            className={clsx(
              'decoration-ink-500 border-none bg-transparent px-0 text-2xl font-semibold underline decoration-dotted underline-offset-[6px] outline-none focus:underline focus:decoration-solid focus:underline-offset-[6px] focus:outline-none focus:ring-0 focus-visible:outline-none',
              usernameHover && ' decoration-solid '
            )}
            maxLength={30}
            onChange={(e) => {
              setName(e.target.value)
            }}
            onBlur={() => {
              if (name.length <= 0 || !name) {
                setName(user ? user.name : 'Name')
              }
              saveName()
            }}
          />
        </Row>
      </Row>
      <div>
        We've sent you <strong>{formatMoney(STARTING_BALANCE)}</strong> in play
        money. {capitalize(TRADE_TERM)} on the answer you think is right.
      </div>
      <div className="mt-2">
        Research shows wagering currency leads to more accurate predictions than
        polls.
      </div>
      <Image
        src="/welcome/manifold-example.gif"
        className="my-4 h-full w-full max-w-xl self-center object-contain"
        alt={'Manifold example animation'}
        width={200}
        height={100}
      />
    </>
  )
}

export function SweepsCoinsPage() {
  return (
    <>
      <div className="text-primary-700 text-center text-2xl font-normal">
        How Manifold works
      </div>

      <span className="mt-4 md:mt-6">
        Manifold has 2 coins that you can {TRADE_TERM} with:
      </span>
      <span className="coin-offset relative ml-[1.1em] mt-4 inline-flex items-center md:mt-6">
        <ManaCoin className="absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]" />
        <span className="text-primary-700 mr-1.5 font-semibold">
          {' '}
          Mana ({ENV_CONFIG.moneyMoniker})
        </span>
        is play money
      </span>
      <span className="coin-offset relative ml-[1.1em] mt-4 inline-flex items-center md:mt-6">
        <SweepiesCoin className="absolute -left-[var(--coin-offset)] top-[var(--coin-top-offset)] min-h-[1em] min-w-[1em]" />
        <span className="mr-1.5 font-semibold text-amber-700 dark:text-amber-300">
          {' '}
          {SWEEPIES_NAME} ({SWEEPIES_MONIKER})
        </span>
        can be redeemed for <b className="ml-1">real money</b>
      </span>

      <div className="mt-4 md:mt-6">
        Not all questions allow for {TRADING_TERM} in {SWEEPIES_NAME}. Look for
        the toggle on a question to see if it's available.
      </div>

      <Col className="bg-canvas-50 text-ink-400 mt-4 w-full justify-between rounded-lg px-6 py-4 text-xl md:mt-6">
        <Row className="w-full justify-between">
          <ArrowLeftIcon className="h-5 w-5" aria-hidden />
          <Row>
            <CosmeticTwombaToggle />
          </Row>
        </Row>
        <div>Will it rain tomorrow?</div>
        <div className="mt-1 text-3xl">
          31% <span className="text-sm">chance</span>
        </div>
        <PlaceholderGraph className="text-ink-300 h-28" />
      </Col>
      <div className="text-ink-500 my-2 text-xs">
        You must be 18+ to participate. Manifold is free to play, no purchase
        required.
      </div>
    </>
  )
}

export function CosmeticTwombaToggle() {
  const [isPlay, setIsPlay] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setIsPlay((prev) => !prev)
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={clsx(
        'bg-ink-200 dark:bg-canvas-50 relative flex h-fit w-fit shrink-0 flex-row items-center gap-1 rounded-full border-[1.5px] p-0.5 text-2xl transition-colors',
        isPlay
          ? 'dark:border-primary-700 border-primary-500'
          : 'border-amber-500 dark:border-amber-200'
      )}
    >
      {/* Add a moving circle behind the active coin */}
      <div
        className={clsx(
          'dark:bg-ink-300 bg-canvas-0 absolute h-[28px] w-[28px] rounded-full drop-shadow transition-all',
          isPlay ? 'left-0' : 'left-[calc(100%-28px)]'
        )}
      />
      <ManaFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          isPlay ? 'opacity-100' : 'opacity-20'
        )}
      />
      <SweepiesFlatCoin
        className={clsx(
          'z-10 h-8 transition-opacity',
          !isPlay ? 'opacity-100' : 'opacity-20'
        )}
      />
    </div>
  )
}

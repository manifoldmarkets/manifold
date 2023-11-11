/* eslint-disable react/jsx-key */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Image from 'next/image'
import clsx from 'clsx'

import { STARTING_BALANCE } from 'common/economy'
import { User } from 'common/user'
import { buildArray } from 'common/util/array'
import { formatMoney } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { updateUser } from 'web/lib/firebase/users'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { TopicSelectorDialog } from './topic-selector-dialog'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW } from 'common/envs/constants'
import { Group } from 'common/group'
import {
  ALL_TOPICS,
  getSubtopics,
  removeEmojis,
  TOPICS_TO_SUBTOPICS,
} from 'common/topics'
import { orderBy, uniqBy } from 'lodash'
import { track } from 'web/lib/service/analytics'

export default function Welcome() {
  const user = useUser()
  const isTwitch = useIsTwitch(user)

  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)

  const [showSignedOutUser, setShowSignedOutUser] = useState(false)
  const [groupSelectorOpen, setGroupSelectorOpen] = useState(false)

  const availablePages = buildArray([
    <WhatIsManifoldPage />,
    <PredictionMarketPage />,
    user && <ThankYouPage />,
  ])

  const handleSetPage = (page: number) => {
    if (page === 0) {
      track('welcome screen: what is manifold')
    } else if (page === 1) {
      track('welcome screen: how it works')
    } else if (page === 2) {
      track('welcome screen: thank you')
    }
    setPage(page)
  }

  const isLastPage = page === availablePages.length - 1

  useEffect(() => {
    if (user?.shouldShowWelcome) {
      track('welcome screen: landed', { isTwitch })
      setOpen(true)
    }
  }, [user?.shouldShowWelcome])

  const [userInterestedTopics, setUserInterestedTopics] = useState<Group[]>([])
  const [userBetInTopics, setUserBetInTopics] = useState<Group[]>([])
  const [trendingTopics, setTrendingTopics] = useState<Group[]>([])

  const getTrendingCategories = async (userId: string) => {
    const hardCodedTopicIds = Object.keys(TOPICS_TO_SUBTOPICS)
      .map((topic) => getSubtopics(topic))
      .flat()
      .map(([_, __, groupId]) => groupId)
    const [userInterestedTopicsRes, trendingTopicsRes] = await Promise.all([
      run(
        db.rpc('get_groups_and_scores_from_user_seen_markets', {
          uid: userId,
        })
      ),
      run(
        db
          .from('groups')
          .select('id,data')
          .not('id', 'in', `(${hardCodedTopicIds.join(',')})`)
          .not(
            'slug',
            'in',
            `(${GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW.join(',')})`
          )
          .not(
            'name',
            'in',
            `(${ALL_TOPICS.map((t) => removeEmojis(t)).join(',')})`
          )
          .filter('slug', 'not.ilike', '%manifold%')
          .filter('slug', 'not.ilike', '%sccsq%')
          .order('importance_score', { ascending: false })
          .limit(15)
      ),
    ])
    const userInterestedTopics = orderBy(
      userInterestedTopicsRes.data?.flat().map((groupData) => ({
        ...(groupData?.data as Group),
        id: groupData.id,
        hasBet: groupData.has_bet,
        importanceScore: groupData.importance_score,
      })),
      'importanceScore',
      'desc'
    )
    const trendingTopics = trendingTopicsRes.data?.map((groupData) => ({
      ...(groupData?.data as Group),
      id: groupData.id,
    }))

    setTrendingTopics(
      uniqBy([...userInterestedTopics, ...trendingTopics], (g) =>
        removeEmojis(g.name)
      ).slice(0, 15)
    )
    if (userInterestedTopics.some((g) => g.hasBet)) {
      setUserBetInTopics(
        userInterestedTopics.filter((g) => g.hasBet).slice(0, 5)
      )
    } else {
      setUserInterestedTopics(userInterestedTopics.slice(0, 5))
    }
  }

  useEffect(() => {
    if (user?.id && user?.shouldShowWelcome) getTrendingCategories(user.id)
  }, [user?.id])

  const close = () => {
    setOpen(false)
    setPage(0)

    setGroupSelectorOpen(true)
    track('welcome screen: group selector')

    if (showSignedOutUser) setShowSignedOutUser(false)
  }
  function increasePage() {
    if (!isLastPage) handleSetPage(page + 1)
    else close()
  }

  function decreasePage() {
    if (page > 0) {
      handleSetPage(page - 1)
    }
  }

  const shouldShowWelcomeModals =
    (!isTwitch && user && user.shouldShowWelcome) ||
    (user && !user.shouldShowWelcome && groupSelectorOpen) ||
    showSignedOutUser

  if (!shouldShowWelcomeModals) return <></>

  if (groupSelectorOpen)
    return (
      <TopicSelectorDialog
        skippable={false}
        trendingTopics={trendingTopics}
        userInterestedTopics={userInterestedTopics}
        userBetInTopics={userBetInTopics}
        onClose={() => {
          track('welcome screen: complete')
        }}
      />
    )

  return (
    <Modal open={open} setOpen={increasePage} size={'lg'}>
      <Col className="bg-canvas-0 place-content-between rounded-md px-8 py-6 text-sm md:text-lg">
        {availablePages[page]}
        <Col>
          <Row className="mt-2 justify-between">
            <Button
              color={'gray-white'}
              className={page === 0 ? 'invisible' : ''}
              onClick={decreasePage}
            >
              Previous
            </Button>
            <Button onClick={increasePage}>
              {isLastPage ? `Claim ${formatMoney(STARTING_BALANCE)}` : 'Next'}
            </Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}

const useIsTwitch = (user: User | null | undefined) => {
  const router = useRouter()
  const isTwitch = router.pathname === '/twitch'

  useEffect(() => {
    if (isTwitch && user?.shouldShowWelcome) {
      updateUser(user.id, { shouldShowWelcome: false })
    }
  }, [isTwitch, user?.id, user?.shouldShowWelcome])

  return isTwitch
}

function WhatIsManifoldPage() {
  return (
    <>
      <Image
        className="h-1/3 w-1/3 place-self-center object-contain sm:h-1/2 sm:w-1/2 "
        src="/logo.svg"
        alt="Manifold Logo"
        height={150}
        width={150}
      />
      <div className="to-ink-0mt-3 text-primary-700 mb-6 text-center text-2xl font-normal">
        Welcome to Manifold
      </div>
      <p className="mb-4 text-lg">
        Manifold is a play-money prediction market platform where you can bet on
        anything.
      </p>
      <p> </p>
    </>
  )
}

function PredictionMarketPage() {
  return (
    <>
      <div className="text-primary-700 mb-6 mt-3 text-center text-2xl font-normal">
        How it works
      </div>
      <div className="mt-2 text-lg">
        Create a question on anything. Bet on the right answer. Traders putting
        their money where their mouth is produces accurate predictions.
      </div>
      <Image
        src="/welcome/manifold-example.gif"
        className="my-4 h-full w-full object-contain"
        alt={'Manifold example animation'}
        width={200}
        height={100}
      />
    </>
  )
}

function ThankYouPage() {
  return (
    <>
      <Image
        className="mx-auto mb-6 h-1/2 w-1/2 object-contain"
        src={'/welcome/treasure.png'}
        alt="Mana signup bonus"
        width={200}
        height={100}
      />
      <div className="text-primary-700 mb-6 text-center text-2xl font-normal">
        Start trading
      </div>
      <p className="text-lg">
        As a thank you for signing up, we sent you{' '}
        <strong className="text-xl">{formatMoney(STARTING_BALANCE)}</strong> in
        mana, our play money!
      </p>
      <p className={'my-3 text-lg '}>
        Mana can't be converted into cash, but can be purchased and donated to
        charity at a ratio of{' '}
        <strong className="text-xl">{formatMoney(100)} : $1</strong>.
      </p>
    </>
  )
}

export function CharityPage(props: { className?: string }) {
  const { className } = props
  return (
    <Col className={clsx('bg-canvas-0', className)}>
      <div className="text-primary-700 mb-4 text-xl">Donate to charity</div>
      <img
        height={100}
        src="/welcome/charity.gif"
        className="my-4 h-full w-full rounded-md object-contain"
        alt=""
      />
      <p className="mb-2 mt-2 text-left text-lg">
        You can turn your mana earnings into a real donation to charity, at a
        100:1 ratio. E.g. when you donate{' '}
        <span className="font-semibold">{formatMoney(1000)}</span> to Givewell,
        Manifold sends them <span className="font-semibold">$10 USD</span>.
      </p>
    </Col>
  )
}

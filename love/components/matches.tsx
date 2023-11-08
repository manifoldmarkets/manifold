import clsx from 'clsx'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { sortBy } from 'lodash'

import { CPMMMultiContract, contractPath } from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from './add-a-match-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Lover } from 'love/hooks/use-lover'
import { Row } from 'web/components/layout/row'
import { formatMoney, formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import { RejectButton } from './reject-button'
import { useUser } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Subtitle } from 'web/components/widgets/subtitle'
import { linkClass } from 'web/components/widgets/site-link'
import { areGenderCompatible } from 'love/lib/util/gender'
import { track } from 'web/lib/service/analytics'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { NoLabel, YesLabel } from 'web/components/outcome-label'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { CommentsButton } from 'web/components/comments/comments-button'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { getSixMonthProb } from 'love/lib/util/relationship-market'

export const Matches = (props: { userId: string }) => {
  const { userId } = props
  const lovers = useLovers()
  const matches = useMatches(userId)
  const user = useUser()

  const truncatedSize = 5
  const [expanded, setExpanded] = useState(false)

  if (!lovers || !matches) return <LoadingIndicator />

  const lover = lovers.find((lover) => lover.user_id === userId)

  const matchesSet = new Set([
    ...matches.map((contract) => contract.loverUserId1),
    ...matches.map((contract) => contract.loverUserId2),
  ])
  const potentialLovers = lovers
    .filter((l) => l.user_id !== userId)
    .filter((l) => !matchesSet.has(l.user_id))
    .filter((l) => !lover || areGenderCompatible(lover, l))
    .filter((l) => l.looking_for_matches)
  const currentMatches = matches.filter((c) => !c.isResolved)
  const areYourMatches = userId === user?.id

  return (
    <Col className="bg-canvas-0 max-w-lg gap-4 rounded px-4 py-3">
      {currentMatches.length > 0 ? (
        <Col className="gap-2">
          <div className="text-lg font-semibold">
            Chance of 6 month relationship
          </div>
          {(expanded
            ? currentMatches
            : currentMatches.slice(0, truncatedSize)
          ).map((contract) => {
            const matchedLoverId =
              contract.loverUserId1 === userId
                ? contract.loverUserId2
                : contract.loverUserId1
            const matchedLover = lovers.find(
              (lover) =>
                lover.user_id === matchedLoverId && lover.looking_for_matches
            )
            return (
              matchedLover && (
                <MatchContract
                  key={contract.id}
                  contract={contract}
                  lover={matchedLover}
                  isYourMatch={areYourMatches}
                />
              )
            )
          })}
          {!expanded && currentMatches.length > truncatedSize && (
            <Button
              className="self-start"
              size="xs"
              color="indigo-outline"
              onClick={() => setExpanded(true)}
            >
              Show {currentMatches.length - truncatedSize} more
            </Button>
          )}
        </Col>
      ) : (
        <span className={'text-ink-500 text-sm'}>No matches yet.</span>
      )}

      {lover && (
        <AddAMatchButton lover={lover} potentialLovers={potentialLovers} />
      )}
    </Col>
  )
}

const MatchContract = (props: {
  contract: CPMMMultiContract
  lover: Lover
  isYourMatch: boolean
}) => {
  const { lover, isYourMatch } = props
  const contract = (useFirebasePublicContract(
    props.contract.visibility,
    props.contract.id
  ) ?? props.contract) as CPMMMultiContract
  const { answers } = contract
  const sixMonthProb = getSixMonthProb(contract)
  const { user, pinned_url } = lover
  const currentUser = useUser()

  const [positions, setPositions] = usePersistentInMemoryState<
    undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  >(undefined, 'market-card-feed-positions-' + contract.id)
  useEffect(() => {
    getCPMMContractUserContractMetrics(contract.id, 10, answers[0].id, db).then(
      (positions) => {
        const yesPositions = sortBy(
          positions.YES.filter(
            (metric) => metric.userUsername !== 'ManifoldLove'
          ),
          (metric) => metric.invested
        ).reverse()
        const noPositions = sortBy(
          positions.NO.filter(
            (metric) => metric.userUsername !== 'ManifoldLove'
          ),
          (metric) => metric.invested
        ).reverse()
        setPositions({ YES: yesPositions, NO: noPositions })
      }
    )
  }, [contract.id])

  const [expanded, setExpanded] = useState(false)

  return (
    <Col>
      <Row
        className="items-center justify-between"
        onClick={() => setExpanded((b) => !b)}
      >
        <Row className="items-center gap-2">
          {expanded ? (
            <ChevronUpIcon className={'mr-2 h-4 w-4'} />
          ) : (
            <ChevronDownIcon className={'mr-2 h-4 w-4'} />
          )}
          {pinned_url && (
            <Avatar avatarUrl={pinned_url} username={user.username} />
          )}
          <UserLink name={user.name} username={user.username} />
        </Row>
        <Row className="items-center gap-2">
          <div className="font-semibold">{formatPercent(sixMonthProb)}</div>
          <BetButton contract={contract} lover={lover} />
          <CommentsButton
            className="min-w-[36px]"
            contract={contract}
            user={currentUser}
          />
        </Row>
      </Row>

      {expanded && isYourMatch && (
        <Row className="mt-2 justify-between gap-2">
          <RejectButton lover={lover} />
          <SendMessageButton toUser={user} currentUser={currentUser} />
        </Row>
      )}

      {expanded && positions && (
        <Row className="mb-2 mt-2 max-w-full gap-6 overflow-hidden sm:gap-8">
          <Col className="w-[50%] gap-2">
            <div>
              Invested in <YesLabel />
            </div>
            {positions.YES.length === 0 && (
              <div className="text-ink-500">None</div>
            )}
            {positions.YES.map((position) => (
              <Row key={position.userId} className="justify-between gap-4">
                <Row className="items-center gap-2">
                  {pinned_url && (
                    <Avatar
                      avatarUrl={position.userAvatarUrl}
                      username={position.userUsername}
                      size="xs"
                    />
                  )}
                  <UserLink
                    name={position.userName}
                    username={position.userUsername}
                    hideBadge
                    short
                  />
                </Row>
                <div>{formatMoney(position.invested)}</div>
              </Row>
            ))}
          </Col>
          <Col className="w-[50%] gap-2">
            <div>
              Invested in <NoLabel />
            </div>
            {positions.NO.length === 0 && (
              <div className="text-ink-500">None</div>
            )}
            {positions.NO.map((position) => (
              <Row key={position.userId} className="justify-between gap-4">
                <Row className="items-center gap-2">
                  {pinned_url && (
                    <Avatar
                      avatarUrl={position.userAvatarUrl}
                      username={position.userUsername}
                      size="xs"
                    />
                  )}
                  <UserLink
                    name={position.userName}
                    username={position.userUsername}
                    hideBadge
                    short
                  />
                </Row>
                <div>{formatMoney(position.invested)}</div>
              </Row>
            ))}
          </Col>
        </Row>
      )}
    </Col>
  )
}

const BetButton = (props: { contract: CPMMMultiContract; lover: Lover }) => {
  const { contract } = props
  const { answers } = contract

  const user = useUser()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="xs"
        color="indigo-outline"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
          track('love bet button click')
        }}
      >
        Bet
      </Button>
      <Modal
        open={open}
        setOpen={setOpen}
        className={clsx(
          MODAL_CLASS,
          'pointer-events-auto max-h-[32rem] overflow-auto'
        )}
      >
        <Col>
          <Link href={contractPath(contract)}>
            <Subtitle className={clsx('!mb-4 !mt-0 !text-xl', linkClass)}>
              {contract.question}
            </Subtitle>
          </Link>
          <BuyPanel
            contract={contract}
            multiProps={{ answers, answerToBuy: answers[0] }}
            user={user}
            initialOutcome={'YES'}
            onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
            location={'love profile'}
            inModal={true}
          />
        </Col>
      </Modal>
    </>
  )
}

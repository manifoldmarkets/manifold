import clsx from 'clsx'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowRightIcon,
} from '@heroicons/react/outline'
import { sortBy } from 'lodash'

import { CPMMMultiContract, contractPath } from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from '../add-a-match-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Row } from 'web/components/layout/row'
import { formatMoney, formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import { RejectButton } from '../reject-button'
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
import {
  BinaryOutcomeLabel,
  NoLabel,
  YesLabel,
} from 'web/components/outcome-label'
import { SendMessageButton } from 'web/components/messaging/send-message-button'
import { CommentsButton } from 'web/components/comments/comments-button'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { getCumulativeRelationshipProb } from 'love/lib/util/relationship-market'
import { ControlledTabs } from 'web/components/layout/tabs'
import { Answer } from 'common/answer'
import { ConfirmStageButton } from '../confirm-stage-button'
import { useAnswersCpmm } from 'web/hooks/use-answers'
import { Lover } from 'common/love/lover'
import { MatchTile } from './match-tile'
import { UserIcon } from '@heroicons/react/outline'

export function MatchPositionsButton(props: {
  contract: CPMMMultiContract
  answer: Answer
}) {
  const { contract, answer } = props
  const [open, setOpen] = useState(false)
  const [positions, setPositions] = usePersistentInMemoryState<
    undefined | Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
  >(undefined, 'market-card-feed-positions-' + contract.id)
  useEffect(() => {
    getCPMMContractUserContractMetrics(contract.id, 10, answer.id, db).then(
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
  }, [contract.id, answer.id])

  const totalPositions = positions
    ? positions.YES.length + positions.NO.length
    : 0

  return (
    <>
      <button
        disabled={totalPositions === 0}
        className={clsx(
          'text-ink-500 flex h-full flex-row items-center justify-center gap-1.5 transition-transform'
        )}
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        <Row className="relative gap-1.5 text-sm">
          <UserIcon className="h-5 w-5" />
          {totalPositions}
        </Row>
      </button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          Trades on {answer.text}
          <MatchPositionsContent positions={positions} />
        </Col>
      </Modal>
    </>
  )
}

function MatchPositionsContent(props: {
  positions?: Awaited<ReturnType<typeof getCPMMContractUserContractMetrics>>
}) {
  const { positions } = props
  if (!positions) {
    return <LoadingIndicator />
  }
  return (
    <Row className="w-full gap-6 overflow-hidden sm:gap-8">
      <Col className="w-[50%] gap-2">
        <div>
          Invested in <YesLabel />
        </div>
        {positions.YES.length === 0 && <div className="text-ink-500">None</div>}
        {positions.YES.map((position) => (
          <Row key={position.userId} className="justify-between gap-4">
            <Row className="items-center gap-2">
              <Avatar
                avatarUrl={position.userAvatarUrl}
                username={position.userUsername}
                size="xs"
              />
              <UserLink
                user={{
                  id: position.userId,
                  name: position.userName,
                  username: position.userUsername,
                }}
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
        {positions.NO.length === 0 && <div className="text-ink-500">None</div>}
        {positions.NO.map((position) => (
          <Row key={position.userId} className="justify-between gap-4">
            <Row className="items-center gap-2">
              <Avatar
                avatarUrl={position.userAvatarUrl}
                username={position.userUsername}
                size="xs"
              />
              <UserLink
                user={{
                  id: position.userId,
                  name: position.userName,
                  username: position.userUsername,
                }}
                hideBadge
                short
              />
            </Row>
            <div>{formatMoney(position.invested)}</div>
          </Row>
        ))}
      </Col>
    </Row>
  )
}

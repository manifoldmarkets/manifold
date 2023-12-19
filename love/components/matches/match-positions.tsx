
import clsx from 'clsx'
import { sortBy } from 'lodash'
import { useEffect, useState } from 'react'

import { UserIcon } from '@heroicons/react/outline'
import { Answer } from 'common/answer'
import { CPMMMultiContract, contractPath } from 'common/contract'
import { getCPMMContractUserContractMetrics } from 'common/supabase/contract-metrics'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { NoLabel, YesLabel } from 'web/components/outcome-label'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserLink } from 'web/components/widgets/user-link'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'
import { Tooltip } from 'web/components/widgets/tooltip'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'

export function MatchPositionsButton(props: {
  contract: CPMMMultiContract
  answer: Answer
  modalHeader?: React.ReactNode
}) {
  const { contract, answer, modalHeader } = props
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
      <Tooltip text={`Positions`} placement="top-start" noTap>
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
            {modalHeader}
            <span>
              <span className="text-ink-600">Positions on </span>
              <span className={clsx('text-primary-600', linkClass)}>
                <Link href={contractPath(contract)}>{answer.text}</Link>
              </span>
            </span>
            <MatchPositionsContent positions={positions} />
          </Col>
        </Modal>
      </Tooltip>
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

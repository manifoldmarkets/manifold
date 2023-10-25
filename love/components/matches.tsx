import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import {
  BinaryContract,
  CPMMBinaryContract,
  contractPath,
} from 'common/contract'
import { useLovers } from 'love/hooks/use-lovers'
import { useMatches } from 'love/hooks/use-matches'
import { Col } from 'web/components/layout/col'
import { AddAMatchButton } from './add-a-match-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Lover } from 'love/hooks/use-lover'
import { Row } from 'web/components/layout/row'
import { getProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import { RejectButton } from './reject-button'
import { useUser } from 'web/hooks/use-user'
import { Avatar } from 'web/components/widgets/avatar'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { BuyPanel } from 'web/components/bet/bet-panel'
import { Subtitle } from 'web/components/widgets/subtitle'
import { linkClass } from 'web/components/widgets/site-link'
import { areGenderCompatible } from 'love/lib/utils'

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
              (lover) => lover.user_id === matchedLoverId
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
  contract: BinaryContract
  lover: Lover
  isYourMatch: boolean
}) => {
  const { contract, lover, isYourMatch } = props
  const prob = getProbability(contract)
  const { user, pinned_url } = lover
  return (
    <Row className="items-center justify-between">
      <Row className="items-center gap-2">
        {pinned_url && (
          <Avatar avatarUrl={pinned_url} username={user.username} />
        )}
        <UserLink name={user.name} username={user.username} />
      </Row>
      <Row className="items-center gap-2">
        <div className="font-semibold">{formatPercent(prob)}</div>
        <BetButton contract={contract} lover={lover} />
        {isYourMatch && <RejectButton lover={lover} />}
      </Row>
    </Row>
  )
}

const BetButton = (props: { contract: BinaryContract; lover: Lover }) => {
  const { contract } = props
  const user = useUser()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="xs" color="indigo-outline" onClick={() => setOpen(true)}>
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
            contract={contract as CPMMBinaryContract}
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

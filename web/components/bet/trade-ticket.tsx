import clsx from 'clsx'
import Link from 'next/link'
import { ComponentProps, ReactNode } from 'react'

import {
  contractPath,
  CPMMMultiContract,
  CPMMNumericContract,
} from 'common/contract'
import { getAnswerProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { showsSideProbability, versusSideProb } from 'common/versus'
import { MultiBetProps } from 'client-common/lib/bet'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import { BinaryOutcomes, BuyPanel } from './bet-panel'

// Lives apart from bet-dialog so answer rows can open a ticket: bet-dialog
// imports AnswerBar from answer-components, so importing back would cycle.

type TradeTicketProps = {
  contract: CPMMMultiContract | CPMMNumericContract
  multiProps: MultiBetProps
  trackingLocation: string
  onBuySuccess: () => void
  onBetPlaced?: ComponentProps<typeof BuyPanel>['onBetPlaced']
  initialOutcome?: BinaryOutcomes
  title?: string
  /** For an answer's ticket: the market question, shown small above it. */
  question?: string
  description?: ReactNode
  /** Shown above the title, e.g. a link back to the answer list. */
  above?: ReactNode
  /** Shown below the probability, e.g. a picker between answers. */
  below?: ReactNode
  probabilityLabel?: string
  pseudonym?: ComponentProps<typeof BuyPanel>['pseudonym']
  feedReason?: string
}

/** Compact ticket for one answer of a multi-answer market, including versus. */
export function TradeDialog(
  props: Omit<TradeTicketProps, 'onBuySuccess'> & {
    open: boolean
    setOpen: (open: boolean) => void
  }
) {
  const { open, setOpen, ...ticketProps } = props
  return (
    <TradeModal
      open={open}
      setOpen={setOpen}
      title={props.title ?? props.contract.question}
    >
      <TradeTicket
        {...ticketProps}
        onBuySuccess={() => setTimeout(() => setOpen(false), 500)}
      />
    </TradeModal>
  )
}

export function TradeModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  title: string
  children: ReactNode
}) {
  const { open, setOpen, title, children } = props
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      ariaLabel={`Bet on ${title}`}
      adaptToKeyboard
      closeButtonPosition="inside"
      className={clsx(MODAL_CLASS, '!px-4 !py-3 sm:!p-6')}
    >
      {children}
    </Modal>
  )
}

export function TradeTicket(props: TradeTicketProps) {
  const {
    contract,
    multiProps,
    trackingLocation,
    onBuySuccess,
    onBetPlaced,
    initialOutcome,
    title = contract.question,
    question,
    description,
    above,
    below,
    probabilityLabel = 'Probability',
    feedReason,
  } = props
  const pseudonym = props.pseudonym ?? {
    YES: { pseudonymName: 'YES', pseudonymColor: 'green' as const },
    NO: { pseudonymName: 'NO', pseudonymColor: 'red' as const },
  }

  const initialProb = getAnswerProbability(contract, multiProps.answerToBuy.id)
  // Named sides (e.g. Republican/Democratic) show the chosen side's chance;
  // plain YES/NO shows the YES chance, which buying NO moves down.
  const sideProb = showsSideProbability(contract, pseudonym)
  const heading = (
    <>
      {above}
      {question && (
        <div className="text-ink-600 line-clamp-2 pr-7 text-sm">{question}</div>
      )}
      <Link
        className="line-clamp-2 pr-7 text-lg font-semibold leading-snug hover:underline"
        href={contractPath(contract)}
        title={title}
      >
        {title}
      </Link>
      {description && <div className="text-ink-600 text-sm">{description}</div>}
    </>
  )
  // Lists and sports rows can be stale, so the market may have closed since.
  const isClosed =
    contract.isResolved ||
    (contract.closeTime != null && contract.closeTime <= Date.now())
  if (isClosed)
    return (
      <Col className="gap-1">
        {heading}
        <p className="text-ink-600 py-4 text-sm">
          Trading has closed on this market.
        </p>
      </Col>
    )

  return (
    <BuyPanel
      key={contract.id + multiProps.answerToBuy.id}
      contract={contract}
      multiProps={multiProps}
      onBuySuccess={onBuySuccess}
      onBetPlaced={onBetPlaced}
      location={trackingLocation}
      feedReason={feedReason}
      inModal={true}
      initialOutcome={initialOutcome ?? 'YES'}
      alwaysShowOutcomeSwitcher
      compact
      pseudonym={pseudonym}
      className="!m-0 !p-0"
    >
      {(selectedOutcome) => {
        const label = sideProb
          ? `${pseudonym[selectedOutcome ?? 'YES'].pseudonymName} probability`
          : probabilityLabel
        return (
          <Col className="mb-2 gap-1">
            {heading}
            <Row className="items-baseline justify-between gap-2">
              <span
                className="text-ink-500 min-w-0 truncate text-sm"
                title={label}
              >
                {label}
              </span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {formatPercent(
                  sideProb
                    ? versusSideProb(selectedOutcome ?? 'YES', initialProb)
                    : initialProb
                )}
              </span>
            </Row>
            {below}
          </Col>
        )
      }}
    </BuyPanel>
  )
}

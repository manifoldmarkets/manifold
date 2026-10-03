import { useState } from 'react'
import clsx from 'clsx'
import { Contract, contractPath } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import { BetDialog } from 'web/components/bet/bet-dialog'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import {
  approvalChance,
  BallotMeasure,
  MeasureSide,
  sideProbability,
  tradeFor,
} from './ballot-measures-model'
import styles from './election-explorer.module.css'

export function BallotMeasureCard({
  measure,
  contract,
}: {
  measure: BallotMeasure
  contract?: Contract | null
}) {
  const [side, setSide] = useState<MeasureSide>()
  const chance = approvalChance(measure, contract)
  const trade = side && tradeFor(measure, side)
  const source = measure.source
  const answer =
    source?.kind === 'portfolio-answer' &&
    contract?.mechanism === 'cpmm-multi-1'
      ? contract.answers.find((a) => a.id === source.answerId)
      : undefined
  const closed =
    !!contract?.isResolved ||
    !!contract?.resolution ||
    !!answer?.resolution ||
    (contract?.closeTime != null && contract.closeTime <= Date.now())
  const approveIsYes = measure.source?.yesOrientation !== 'reject'
  const pass = { pseudonymName: 'Pass', pseudonymColor: 'green' as const }
  const fail = { pseudonymName: 'Fail', pseudonymColor: 'gray' as const }
  const pseudonym = {
    YES: approveIsYes ? pass : fail,
    NO: approveIsYes ? fail : pass,
  }
  const label = measure.designation ?? measure.title
  const question = `Will ${label} be approved by ${measure.state} voters in November 2026?`
  return (
    <article className={styles.measureCard} aria-label={label}>
      <div className={styles.measureHeading}>
        <h3>{label}</h3>
        {contract && (
          <a
            className={styles.chartLink}
            href={contractPath(contract)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Chart and market details for ${label}`}
          >
            chart →
          </a>
        )}
      </div>
      <span className={styles.measureTopic}>{measure.topic}</span>
      <p>{measure.shortSummary}</p>
      {measure.source?.criteriaNote && (
        <p className={styles.measureCaveat}>
          {measure.source.confidence === 'conditional' && (
            <strong>Criteria incomplete. </strong>
          )}
          {measure.source.criteriaNote}
        </p>
      )}
      {chance !== undefined && contract ? (
        <>
          <div className={styles.measureBets}>
            {(['pass', 'fail'] as const).map((s) => (
              <button
                key={s}
                disabled={closed}
                aria-haspopup="dialog"
                onClick={() => setSide(s)}
              >
                <span>{s === 'pass' ? 'Pass' : 'Fail'}</span>
                <strong>{formatPercent(sideProbability(chance, s))}</strong>
              </button>
            ))}
          </div>
          {closed && <p className={styles.note}>Trading closed.</p>}
        </>
      ) : (
        <p className={styles.note}>
          {measure.source
            ? 'Market odds unavailable.'
            : measure.marketNote ?? 'No linked market yet.'}
        </p>
      )}
      <details className={styles.measureRules}>
        <summary>Ballot details</summary>
        <p>{measure.approvalRule}</p>
        {measure.yesMeans && <p>{measure.yesMeans}</p>}
        {measure.noMeans && <p>{measure.noMeans}</p>}
        {measure.source?.offBallot && (
          <p>
            If removed from the ballot:{' '}
            {measure.source.offBallot === 'unspecified'
              ? 'market rule unspecified'
              : measure.source.offBallot}
            .
          </p>
        )}
        {measure.verification === 'secondary' && (
          <p>
            Ballot identity checked against secondary sources; official details
            await confirmation.
          </p>
        )}
        <a
          className={styles.chartLink}
          href={measure.officialSourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Official voter information →
        </a>
      </details>
      {trade &&
        contract?.mechanism === 'cpmm-1' &&
        contract.outcomeType === 'BINARY' && (
          <BetDialog
            contract={contract}
            open
            setOpen={(open) => !open && setSide(undefined)}
            trackingLocation="election ballot measure"
            initialOutcome={trade.outcome}
            questionPseudonym={question}
            binaryPseudonym={pseudonym}
          />
        )}
      {trade &&
        answer &&
        contract?.mechanism === 'cpmm-multi-1' &&
        contract.outcomeType === 'MULTIPLE_CHOICE' && (
          <Modal
            open
            setOpen={(open) => !open && setSide(undefined)}
            ariaLabel={`Bet on ${label}`}
            className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
          >
            <h2 className="mb-2 text-xl font-semibold">{question}</h2>
            <p className="text-ink-500 mb-4 text-sm">
              {measure.source?.criteriaNote ??
                'Pass means approval of this measure at the November 2026 vote.'}
            </p>
            <AnswerCpmmBetPanel
              answer={answer}
              contract={contract}
              outcome={trade.outcome}
              closePanel={() => setSide(undefined)}
              alwaysShowOutcomeSwitcher
              pseudonym={pseudonym}
            />
          </Modal>
        )}
    </article>
  )
}

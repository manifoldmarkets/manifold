import { useState } from 'react'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { CPMMMultiContract } from 'common/contract'
import { getAnswerProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { AnswerCpmmBetPanel } from 'web/components/answers/answer-bet-panel'
import {
  Modal,
  MODAL_CLASS,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { DEM_COLOR, REP_COLOR } from './state-election-map'
import styles from './election-explorer.module.css'

export function DistrictBetButtons({
  contract,
  answer,
  label,
  matchup,
}: {
  contract: CPMMMultiContract
  answer: Answer
  label: string
  matchup?: string
}) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const dem = getAnswerProbability(contract, answer.id)
  const closed =
    !!contract.isResolved ||
    !!answer.resolution ||
    (contract.closeTime != null && contract.closeTime <= Date.now())
  return (
    <>
      {matchup && <p className={styles.matchup}>{matchup}</p>}
      <div className={styles.betChoices}>
        <button
          disabled={closed}
          aria-haspopup="dialog"
          onClick={() => setOutcome('YES')}
          style={{ color: DEM_COLOR }}
        >
          <span>Bet Democratic</span>
          <strong>{formatPercent(dem)}</strong>
        </button>
        <button
          disabled={closed}
          aria-haspopup="dialog"
          onClick={() => setOutcome('NO')}
          style={{ color: REP_COLOR }}
        >
          <span>Bet not Democratic</span>
          <strong>{formatPercent(1 - dem)}</strong>
        </button>
      </div>
      <p className={styles.note}>
        {closed
          ? 'Trading has closed for this district.'
          : 'Yes means a Democrat wins. No means any other winner.'}
      </p>
      {outcome && (
        <Modal
          open
          setOpen={(open) => !open && setOutcome(undefined)}
          ariaLabel={`Bet on ${label}`}
          className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
        >
          <h2 className="mb-2 text-xl font-semibold">{label}</h2>
          <p className="text-ink-500 mb-4 text-sm">
            Will a Democrat win this district? Yes = Democratic; No = any other
            winner.
          </p>
          <AnswerCpmmBetPanel
            answer={answer}
            contract={contract}
            outcome={outcome}
            closePanel={() => setOutcome(undefined)}
            alwaysShowOutcomeSwitcher
          />
        </Modal>
      )}
    </>
  )
}

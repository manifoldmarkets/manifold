import { useState } from 'react'
import Image from 'next/image'
import { Contract, contractPath } from 'common/contract'
import { BetDialog } from 'web/components/bet/bet-dialog'
import { formatOdds } from './election-display'
import { electionOdds } from './election-map-model'
import styles from './election-explorer.module.css'

export function ControlCard({
  label,
  contract,
}: {
  label: string
  contract: Contract | null
}) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>()
  const odds = electionOdds(contract, true)
  const rep = odds && odds.rep > odds.dem
  const noLabel = 'Democratic'
  const tradable =
    contract?.mechanism === 'cpmm-1' &&
    contract.outcomeType === 'BINARY' &&
    !contract.isResolved &&
    (contract.closeTime == null || contract.closeTime > Date.now())
  return (
    <>
      <div className={styles.controlCard}>
        <div className={styles.controlTop}>
          <span className={styles.controlLabel}>
            {label} control
            {label === 'Senate' && (
              <details className={styles.controlInfo}>
                <summary aria-label="About Senate control">ⓘ</summary>
                <p>Dem = no Republican majority; includes independents.</p>
              </details>
            )}
          </span>
          {contract && (
            <a
              className={styles.chartLink}
              href={contractPath(contract)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${label} control chart, description and comments (opens in a new tab)`}
            >
              chart →
            </a>
          )}
        </div>
        <button
          className={styles.controlMain}
          aria-label={`Bet on ${label} control`}
          aria-haspopup="dialog"
          disabled={!tradable}
          onClick={() => setOutcome(rep ? 'YES' : 'NO')}
        >
          <span className={styles.controlIcon}>
            <Image
              src={`/politics-party/${
                rep ? 'republican' : 'democrat'
              }_symbol.png`}
              alt={rep ? 'Republican elephant' : 'Democratic donkey'}
              width={32}
              height={32}
            />
          </span>
          <span className={styles.controlLeader}>
            <strong data-tone={rep ? 'rep' : 'dem'}>
              {odds ? formatOdds(rep ? odds.rep : odds.dem) : '—'}
            </strong>
          </span>
          <span className={styles.controlParty}>
            {odds ? (rep ? 'Republican' : noLabel) : 'Unavailable'}
          </span>
        </button>
        <div className={styles.controlBar}>
          {odds && (
            <>
              <i data-tone="dem" style={{ width: `${odds.dem * 100}%` }} />
              <i data-tone="rep" style={{ width: `${odds.rep * 100}%` }} />
            </>
          )}
        </div>
        {odds && (
          <div className={styles.controlBets}>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet ${noLabel} ${label} control`}
              onClick={() => setOutcome('NO')}
              data-tone="dem"
            >
              <span>Dem</span> <strong>{formatOdds(odds.dem)}</strong>
            </button>
            <button
              disabled={!tradable}
              aria-haspopup="dialog"
              aria-label={`Bet Republican ${label} control`}
              onClick={() => setOutcome('YES')}
              data-tone="rep"
            >
              <span>Rep</span> <strong>{formatOdds(odds.rep)}</strong>
            </button>
          </div>
        )}
      </div>
      {outcome &&
        contract?.mechanism === 'cpmm-1' &&
        contract.outcomeType === 'BINARY' && (
          <BetDialog
            contract={contract}
            open
            setOpen={(open) => !open && setOutcome(undefined)}
            initialOutcome={outcome}
            trackingLocation="election map control"
            questionPseudonym={`${label} control`}
            binaryPseudonym={{
              YES: { pseudonymName: 'Republican', pseudonymColor: 'sienna' },
              NO: {
                pseudonymName: noLabel,
                pseudonymColor: 'azure',
              },
            }}
          />
        )}
    </>
  )
}

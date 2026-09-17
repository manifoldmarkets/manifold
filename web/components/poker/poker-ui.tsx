import clsx from 'clsx'
import {
  PokerCard as Card,
  PokerHandView,
  PokerMove,
  PokerTableSummary,
} from 'common/poker/types'
import {
  FaRegHandRock,
  FaRegHandPaper,
  FaRegHandScissors,
} from 'react-icons/fa'
import styles from './poker.module.css'
import { handRankName } from 'common/poker/engine'
import { formatMoney } from 'common/util/format'
export function PokerCard({
  card,
  small = false,
}: {
  card?: Card
  small?: boolean
}) {
  const rank =
    card === undefined
      ? ''
      : ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][
          card % 13
        ]
  const suit =
    card === undefined ? '' : ['♣', '♦', '♥', '♠'][Math.floor(card / 13)]
  const suitName =
    card === undefined
      ? ''
      : ['clubs', 'diamonds', 'hearts', 'spades'][Math.floor(card / 13)]
  return (
    <div
      aria-label={card === undefined ? 'Hidden card' : `${rank} of ${suitName}`}
      className={clsx(
        styles.card,
        small && styles.cardSmall,
        card === undefined && styles.cardBack,
        suit === '♦' || suit === '♥' ? 'text-red-600' : 'text-gray-900'
      )}
    >
      {card === undefined ? (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center text-xs"
        >
          ✦
        </span>
      ) : (
        <>
          <span className={styles.cardCorner}>{rank}</span>
          <span className={styles.cardPip}>{suit}</span>
        </>
      )}
    </div>
  )
}
export function GestureIcon({
  move,
  className,
}: {
  move: PokerMove
  className?: string
}) {
  const Icon = {
    rock: FaRegHandRock,
    paper: FaRegHandPaper,
    scissors: FaRegHandScissors,
  }[move]
  return <Icon aria-hidden className={className} />
}

export function PokerStatus({
  status,
}: {
  status: PokerTableSummary['status']
}) {
  const labels = {
    waiting: 'Waiting for players',
    countdown: 'Starting soon',
    playing: 'In play',
    results: 'Between hands',
    closed: 'Closed',
    paused: 'Paused',
  }
  return (
    <span
      className={styles.status}
      data-active={status === 'playing' || status === 'countdown'}
    >
      <span className={styles.statusDot} aria-hidden />
      {labels[status]}
    </span>
  )
}

export function PokerRules() {
  return (
    <details className={clsx(styles.panel, 'p-4 text-sm')}>
      <summary className="cursor-pointer font-semibold">
        How to play RPS poker
      </summary>
      <div className="text-ink-600 mt-3 space-y-2">
        <p>
          Hold’em cards. Simultaneous betting. Everyone antes, then chooses once
          before the flop and after the flop, turn, and river.
        </p>
        <p>
          <strong>Rock:</strong> raise and call. <strong>Paper:</strong> check,
          or fold to any Rock. <strong>Scissors:</strong> check and call.
        </p>
        <p>
          Each Rock adds half the starting pot, rounded down. All Rock and
          Scissors players pay the number of Rocks × that raise. Nobody plays
          Rock? Everyone checks.
        </p>
        <p>
          A click locks your move. You have 30 seconds; missing a move plays
          Paper and sits you out of future hands.
        </p>
        <p>
          Rock requires enough mana for one raise at submission and reveal. If
          your balance falls below that amount, it becomes Scissors. Calls use
          your balance at reveal; short callers go all-in with side pots.
        </p>
        <p>
          No buy-in or fee. Starting or resuming requires 100× the ante; active
          players can keep playing below that balance. Fractional mana stays in
          your wallet.
        </p>
        <p>
          Leaving during a hand takes effect after settlement. If the host
          leaves, the table closes after the current hand finishes.
        </p>
        <a
          className="text-primary-600 underline"
          href="https://rps.poker/#rules"
          target="_blank"
          rel="noreferrer"
        >
          Full RPS poker rules ↗
        </a>
      </div>
    </details>
  )
}
export function HandResult({ hand }: { hand: PokerHandView }) {
  if (!hand.settlement) return null
  const name = (id: string) =>
    hand.players.find((p) => p.userId === id)?.name ?? 'Player'
  return (
    <div className="space-y-1 text-xs" aria-live="polite">
      {hand.settlement.pots.map((pot, i) => (
        <p key={i}>
          <strong>{pot.winners?.map(name).join(' & ')}</strong> win
          {pot.winners?.length === 1 ? 's' : ''} {formatMoney(pot.amount)}
          {hand.settlement!.pots.length > 1
            ? ` (${i === 0 ? 'main pot' : `side pot ${i}`})`
            : ''}
          .
        </p>
      ))}
      {Object.entries(hand.settlement.refunds).map(([id, amount]) => (
        <p key={id}>
          {formatMoney(amount)} returned to {name(id)} (uncalled).
        </p>
      ))}
      {hand.settlement.showdown &&
        hand.players
          .filter(
            (p) => p.cards && (hand.settlement?.payouts[p.userId] ?? 0) > 0
          )
          .map((p) => (
            <p key={p.userId} className="text-ink-500">
              {p.name}: {handRankName([...p.cards!, ...hand.board])}
            </p>
          ))}
    </div>
  )
}

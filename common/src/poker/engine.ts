import {
  PokerCard,
  PokerHand,
  PokerHandView,
  PokerMove,
  PokerPlayer,
  PokerPot,
  PokerSettlement,
  POKER_ROUND_MS,
} from './types'

export class PokerInvariantError extends Error {}
export function wholeMana(balance: number) {
  if (!Number.isFinite(balance))
    throw new PokerInvariantError('Invalid wallet balance')
  return Math.max(0, Math.floor(balance))
}
export function chipSum(values: number[]) {
  const total = values.reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(total) || total < 0)
    throw new PokerInvariantError('Invalid chip total')
  return total
}
export const potSize = (hand: PokerHand) =>
  chipSum(hand.players.map((p) => p.contributed))
export const raiseSize = (hand: PokerHand) => Math.floor(potSize(hand) / 2)
export const actingPlayers = (hand: PokerHand) =>
  hand.players.filter((p) => !p.folded && !p.allIn)
export const canRock = (hand: PokerHand, balance: number) =>
  wholeMana(balance) >= Math.max(1, raiseSize(hand))

// Base-15 lexicographic rank: category, then up to five kickers.
export function evaluateFive(cards: PokerCard[]): number {
  if (cards.length !== 5) throw new PokerInvariantError('Expected five cards')
  const ranks = cards.map((c) => (c % 13) + 2).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const flush = cards.every(
    (c) => Math.floor(c / 13) === Math.floor(cards[0] / 13)
  )
  const straight =
    counts.size === 5 && ranks[0] - ranks[4] === 4
      ? ranks[0]
      : ranks.join(',') === '14,5,4,3,2'
      ? 5
      : 0
  let result: number[]
  if (flush && straight) result = [8, straight]
  else if (groups[0][1] === 4) result = [7, groups[0][0], groups[1][0]]
  else if (groups[0][1] === 3 && groups[1][1] === 2)
    result = [6, groups[0][0], groups[1][0]]
  else if (flush) result = [5, ...ranks]
  else if (straight) result = [4, straight]
  else if (groups[0][1] === 3) result = [3, ...groups.map((g) => g[0])]
  else if (groups[0][1] === 2 && groups[1][1] === 2)
    result = [2, ...groups.map((g) => g[0])]
  else if (groups[0][1] === 2) result = [1, ...groups.map((g) => g[0])]
  else result = [0, ...ranks]
  while (result.length < 6) result.push(0)
  return result.reduce((a, b) => a * 15 + b, 0)
}
export function evaluateHand(cards: PokerCard[]) {
  if (
    cards.length < 5 ||
    cards.length > 7 ||
    new Set(cards).size !== cards.length ||
    cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)
  )
    throw new PokerInvariantError('Invalid cards')
  let best = -1
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++)
            best = Math.max(
              best,
              evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]])
            )
  return best
}
export function handRankName(cards: PokerCard[]) {
  return [
    'High card',
    'Pair',
    'Two pair',
    'Three of a kind',
    'Straight',
    'Flush',
    'Full house',
    'Four of a kind',
    'Straight flush',
  ][Math.floor(evaluateHand(cards) / 15 ** 5)]
}

export function buildPots(players: PokerPlayer[]): {
  pots: PokerPot[]
  refunds: Record<string, number>
} {
  const levels = [
    ...new Set(players.map((p) => p.contributed).filter((v) => v > 0)),
  ].sort((a, b) => a - b)
  const pots: PokerPot[] = []
  const refunds: Record<string, number> = {}
  let prior = 0
  for (const level of levels) {
    const contributors = players.filter((p) => p.contributed >= level)
    const amount = chipSum(contributors.map(() => level - prior))
    if (contributors.length === 1)
      refunds[contributors[0].userId] =
        (refunds[contributors[0].userId] ?? 0) + amount
    else {
      const eligible = contributors
        .filter((p) => !p.folded)
        .map((p) => p.userId)
      if (!eligible.length)
        throw new PokerInvariantError('Pot has no eligible winner')
      pots.push({ amount, eligible })
    }
    prior = level
  }
  return { pots, refunds }
}

export function settleHand(hand: PokerHand): PokerSettlement {
  const survivors = hand.players.filter((p) => !p.folded)
  if (!survivors.length) throw new PokerInvariantError('No remaining player')
  const { pots, refunds } = buildPots(hand.players)
  const showdown = survivors.length > 1
  const scores = Object.fromEntries(
    survivors.map((p) => [
      p.userId,
      showdown ? evaluateHand([...p.cards, ...hand.board]) : 0,
    ])
  )
  const payouts: Record<string, number> = {}
  for (const pot of pots) {
    const best = Math.max(...pot.eligible.map((id) => scores[id]))
    const winners = hand.players
      .filter(
        (p) => pot.eligible.includes(p.userId) && scores[p.userId] === best
      )
      .sort(
        (a, b) =>
          ((a.seat - hand.dealer + 8) % 9) - ((b.seat - hand.dealer + 8) % 9)
      )
    pot.winners = winners.map((p) => p.userId)
    const each = Math.floor(pot.amount / winners.length)
    const remainder = pot.amount % winners.length
    winners.forEach((p, i) => {
      payouts[p.userId] =
        (payouts[p.userId] ?? 0) + each + (i < remainder ? 1 : 0)
    })
  }
  if (
    chipSum([...Object.values(refunds), ...Object.values(payouts)]) !==
    potSize(hand)
  )
    throw new PokerInvariantError('Settlement does not conserve mana')
  return { pots, refunds, payouts, showdown }
}

function dealStreet(hand: PokerHand) {
  // Burn one card before each community-card street, as in Hold'em.
  hand.deck.shift()
  hand.board.push(...hand.deck.splice(0, hand.street === 0 ? 3 : 1))
  hand.street++
}
export function runOutBoard(hand: PokerHand) {
  while (hand.board.length < 5) dealStreet(hand)
}

export function resolveRound(
  input: PokerHand,
  balances: Record<string, number>,
  now: number,
  automatic: string[] = []
) {
  const hand: PokerHand = JSON.parse(JSON.stringify(input))
  if (hand.settlement) throw new PokerInvariantError('Hand already settled')
  const actors = actingPlayers(hand)
  const startingPot = potSize(hand)
  const raise = Math.floor(startingPot / 2)
  const moves = actors.map((p) => {
    const submitted = hand.moves[p.userId]
    const balance = wholeMana(balances[p.userId])
    const downgraded = submitted === 'rock' && !canRock(hand, balance)
    const timedOut = !submitted && !automatic.includes(p.userId)
    const move: PokerMove = downgraded ? 'scissors' : submitted ?? 'paper'
    if (balance === 0) p.allIn = true
    return { userId: p.userId, move, downgraded, timedOut, paid: 0 }
  })
  const rocks = moves.filter((m) => m.move === 'rock').length
  for (const m of moves) {
    const p = hand.players.find((p) => p.userId === m.userId)!
    if (!p.allIn && m.move === 'paper' && rocks > 0) p.folded = true
  }
  const survivors = hand.players.filter((p) => !p.folded)
  if (survivors.length > 1) {
    const call = chipSum(Array.from({ length: rocks }, () => raise))
    for (const m of moves) {
      const p = hand.players.find((p) => p.userId === m.userId)!
      if (p.folded || p.allIn) continue
      const balance = wholeMana(balances[p.userId])
      m.paid = Math.min(balance, call)
      p.contributed = chipSum([p.contributed, m.paid])
      if (m.paid === balance) p.allIn = true
    }
  }
  hand.rounds.push({ street: hand.street, startingPot, raise, rocks, moves })
  hand.moves = {}
  if (
    survivors.length <= 1 ||
    hand.street === 3 ||
    actingPlayers(hand).length < 2
  ) {
    if (survivors.length > 1) runOutBoard(hand)
    hand.settlement = settleHand(hand)
  } else {
    dealStreet(hand)
    hand.deadline = now + POKER_ROUND_MS
  }
  return hand
}

export function handView(hand: PokerHand, viewerId?: string): PokerHandView {
  return {
    id: hand.id,
    number: hand.number,
    dealer: hand.dealer,
    street: hand.street,
    deadline: hand.deadline,
    board: hand.board,
    rounds: hand.rounds,
    settlement: hand.settlement,
    players: hand.players.map((p) => ({
      userId: p.userId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      seat: p.seat,
      contributed: p.contributed,
      folded: p.folded,
      allIn: p.allIn,
      cards:
        p.userId === viewerId || (hand.settlement?.showdown && !p.folded)
          ? p.cards
          : undefined,
      locked: hand.moves[p.userId] !== undefined,
    })),
    yourMove: viewerId ? hand.moves[viewerId] : undefined,
    pots: hand.settlement?.pots ?? buildPots(hand.players).pots,
  }
}

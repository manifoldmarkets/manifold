import {
  actingPlayers,
  buildPots,
  canRock,
  evaluateHand,
  handRankName,
  handView,
  potSize,
  resolveRound,
  settleHand,
} from './engine'
import { PokerHand, PokerMove, PokerPlayer } from './types'
import { pokerAPI } from './api'

const cards = (s: string) =>
  s
    .split(' ')
    .map((c) => '23456789TJQKA'.indexOf(c[0]) + 'cdhs'.indexOf(c[1]) * 13)
const player = (id: string, seat: number, contributed = 1): PokerPlayer => ({
  userId: id,
  name: id,
  seat,
  sessionId: id,
  cards: [seat * 2, seat * 2 + 1],
  contributed,
  folded: false,
  allIn: false,
})
const hand = (moves: PokerMove[], contribution = 1): PokerHand => ({
  id: 'hand',
  number: 1,
  dealer: 0,
  street: 0,
  deadline: 30_000,
  deck: Array.from(
    { length: 52 - moves.length * 2 },
    (_, i) => i + moves.length * 2
  ),
  board: [],
  players: moves.map((_, i) => player(String(i), i, contribution)),
  moves: Object.fromEntries(moves.map((m, i) => [String(i), m])),
  rounds: [],
})
const balance = (h: PokerHand, amount = 10000) =>
  Object.fromEntries(h.players.map((p) => [p.userId, amount]))

describe('hand evaluation', () => {
  const examples = [
    '2c 4d 6h 8s Tc',
    '2c 2d 6h 8s Tc',
    '2c 2d 6h 6s Tc',
    '2c 2d 2h 8s Tc',
    '2c 3d 4h 5s 6c',
    '2c 4c 6c 8c Tc',
    '2c 2d 2h 8s 8c',
    '2c 2d 2h 2s Tc',
    '2c 3c 4c 5c 6c',
  ]
  it('orders all nine categories', () => {
    const scores = examples.map((s) => evaluateHand(cards(s)))
    expect([...scores].sort((a, b) => a - b)).toEqual(scores)
    expect(new Set(scores).size).toBe(9)
  })
  it('handles wheel and royal straights', () => {
    expect(handRankName(cards('Ac 2d 3h 4s 5c'))).toBe('Straight')
    expect(evaluateHand(cards('Ac 2d 3h 4s 5c'))).toBeLessThan(
      evaluateHand(cards('2c 3d 4h 5s 6c'))
    )
    expect(handRankName(cards('Tc Jc Qc Kc Ac'))).toBe('Straight flush')
  })
  it('selects the best five of seven and all kickers', () => {
    expect(evaluateHand(cards('Tc Jc Qc Kc Ac 2d 3d'))).toBe(
      evaluateHand(cards('Tc Jc Qc Kc Ac'))
    )
    expect(evaluateHand(cards('Ac Ad Kh Qs Jc'))).toBeGreaterThan(
      evaluateHand(cards('Ac Ad Kh Qs Tc'))
    )
    expect(evaluateHand(cards('Ac Ad Ah Ks Kc 2d 2s'))).toBe(
      evaluateHand(cards('Ac Ad Ah Ks Kc'))
    )
  })
  it('rejects duplicate cards', () =>
    expect(() => evaluateHand(cards('Ac Ac 2c 3c 4c'))).toThrow())
})
describe('simultaneous rounds', () => {
  it('checks everyone through without any Rocks', () => {
    const h = hand(['paper', 'scissors', 'paper'])
    const next = resolveRound(h, balance(h), 0)
    expect(next.players.every((p) => !p.folded)).toBe(true)
    expect(potSize(next)).toBe(3)
    expect(next.board.length).toBe(3)
    expect(h.board).toEqual([])
  })
  it('uses the starting pot for every Rock and charges once', () => {
    const h = hand(['rock', 'rock', 'scissors', 'paper'], 5)
    const next = resolveRound(h, balance(h), 0)
    expect(next.rounds[0]).toMatchObject({
      startingPot: 20,
      raise: 10,
      rocks: 2,
    })
    expect(next.players.map((p) => p.contributed)).toEqual([25, 25, 25, 5])
    expect(potSize(next)).toBe(80)
    expect(next.players[3].folded).toBe(true)
  })
  it('rounds half-pot down and checks Rock at the exact threshold', () => {
    const h = hand(['rock', 'paper', 'paper'], 5)
    expect(canRock(h, 7)).toBe(true)
    expect(canRock(h, 6.99)).toBe(false)
    expect(resolveRound(h, balance(h), 0).rounds[0].raise).toBe(7)
  })
  it('downgrades before calculating calls or Paper folds', () => {
    const h = hand(['rock', 'paper', 'scissors'], 5)
    const next = resolveRound(h, { '0': 6, '1': 100, '2': 100 }, 0)
    expect(next.rounds[0].rocks).toBe(0)
    expect(next.players.every((p) => !p.folded)).toBe(true)
    expect(next.rounds[0].moves[0]).toMatchObject({
      move: 'scissors',
      downgraded: true,
      paid: 0,
    })
  })
  it('caps a valid Rock at its remaining stack when others raise', () => {
    const h = hand(['rock', 'rock', 'scissors'], 5)
    const next = resolveRound(h, { '0': 7, '1': 100, '2': 100 }, 0)
    expect(next.rounds[0].moves.map((m) => m.paid)).toEqual([7, 14, 14])
    expect(next.players[0].allIn).toBe(true)
    expect(actingPlayers(next).map((p) => p.userId)).toEqual(['1', '2'])
  })
  it('never reactivates an all-in after receiving mana', () => {
    const h = hand(['rock', 'rock', 'scissors'], 5)
    const first = resolveRound(h, { '0': 7, '1': 100, '2': 100 }, 0)
    first.moves = { '1': 'scissors', '2': 'scissors' }
    const next = resolveRound(first, balance(first), 1)
    expect(next.players[0].contributed).toBe(12)
    expect(next.players[0].allIn).toBe(true)
  })
  it('awards an uncontested pot without charging a raise or exposing cards', () => {
    const h = hand(['rock', 'paper', 'paper'], 5)
    const next = resolveRound(h, balance(h), 0)
    expect(next.settlement?.payouts).toEqual({ '0': 15 })
    expect(next.rounds[0].moves.every((m) => m.paid === 0)).toBe(true)
    expect(handView(next).players.every((p) => !p.cards)).toBe(true)
  })
  it('runs out when only one player has chips left to bet', () => {
    const h = hand(['scissors', 'rock'], 5)
    const next = resolveRound(h, { '0': 2, '1': 100 }, 0)
    expect(next.board).toHaveLength(5)
    expect(next.settlement?.showdown).toBe(true)
    expect(next.settlement?.refunds).toEqual({ '1': 3 })
  })
  it('uses Paper for timeouts but distinguishes intentional leaving', () => {
    const h = hand(['paper', 'paper'])
    h.moves = {}
    const next = resolveRound(h, balance(h), 30000, ['0'])
    expect(next.rounds[0].moves.map((m) => m.timedOut)).toEqual([false, true])
  })
  it('plays four streets and then settles', () => {
    let h = hand(['scissors', 'scissors'])
    for (let i = 0; i < 4; i++) {
      h.moves = { '0': 'scissors', '1': 'scissors' }
      h = resolveRound(h, balance(h), i)
    }
    expect(h.rounds).toHaveLength(4)
    expect(h.board).toHaveLength(5)
    expect(h.settlement).toBeDefined()
  })
})
describe('side pots and privacy', () => {
  it('builds 5/10/20 correctly', () => {
    expect(
      buildPots([player('a', 0, 5), player('b', 1, 10), player('c', 2, 20)])
    ).toEqual({
      pots: [
        { amount: 15, eligible: ['a', 'b', 'c'] },
        { amount: 10, eligible: ['b', 'c'] },
      ],
      refunds: { c: 10 },
    })
  })
  it('keeps folded contributions but excludes their owner', () => {
    const a = player('a', 0, 5)
    a.folded = true
    expect(buildPots([a, player('b', 1, 10), player('c', 2, 10)]).pots).toEqual(
      [
        { amount: 15, eligible: ['b', 'c'] },
        { amount: 10, eligible: ['b', 'c'] },
      ]
    )
  })
  it('awards separate pots to different eligible winners', () => {
    const h = hand(['scissors', 'scissors', 'scissors'])
    h.board = cards('2c 4d 6h 8s Tc')
    h.players.forEach((p, i) => {
      p.contributed = [5, 10, 20][i]
      p.cards = cards(['Ac Ad', 'Kc Kd', 'Qc Qd'][i])
    })
    const result = settleHand(h)
    expect(result.payouts).toEqual({ '0': 15, '1': 10 })
    expect(result.refunds).toEqual({ '2': 10 })
  })
  it('assigns odd mana clockwise after the dealer on a board-only tie', () => {
    const h = hand(['scissors', 'scissors', 'paper'])
    h.board = cards('Ts Js Qs Ks As')
    h.players.forEach((p, i) => {
      p.cards = cards(['2c 3c', '4c 5c', '6c 7c'][i])
    })
    h.players[2].folded = true
    expect(settleHand(h).payouts).toEqual({ '0': 1, '1': 2 })
  })
  it('never includes deck, other hole cards, or unrevealed moves in a view', () => {
    const h = hand(['rock', 'scissors'])
    const view = handView(h, '0')
    expect(view).not.toHaveProperty('deck')
    expect(view).not.toHaveProperty('moves')
    expect(view.yourMove).toBe('rock')
    expect(view.players[0].cards).toEqual(h.players[0].cards)
    expect(view.players[1].cards).toBeUndefined()
    expect(view.players[1].locked).toBe(true)
  })
  it('rejects configurable minimum balances', () => {
    expect(
      pokerAPI['create-poker-table'].props.safeParse({
        requestId: 'f39c66d5-3a00-4062-a3cd-319089749c7c',
        ante: 1,
        visibility: 'public',
        minimumBalance: 50,
      }).success
    ).toBe(false)
  })
  it('conserves mana across many deterministic games with varied balances', () => {
    let seed = 4271
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let game = 0; game < 500; game++) {
      let h = hand(
        Array.from({ length: 2 + (rand() % 8) }, () => 'scissors' as const)
      )
      const funds = Object.fromEntries(
        h.players.map((p) => [p.userId, 1 + (rand() % 500)])
      )
      let paid = potSize(h)
      for (let round = 0; round < 4 && !h.settlement; round++) {
        h.moves = Object.fromEntries(
          actingPlayers(h).map((p) => [
            p.userId,
            (['rock', 'paper', 'scissors'] as const)[rand() % 3],
          ])
        )
        h = resolveRound(h, funds, round)
        for (const m of h.rounds[h.rounds.length - 1].moves) {
          expect(m.paid).toBeLessThanOrEqual(funds[m.userId])
          funds[m.userId] -= m.paid
          paid += m.paid
        }
      }
      expect(h.settlement).toBeDefined()
      expect(
        Object.values(h.settlement!.payouts)
          .concat(Object.values(h.settlement!.refunds))
          .reduce((a, b) => a + b, 0)
      ).toBe(paid)
    }
  })
})

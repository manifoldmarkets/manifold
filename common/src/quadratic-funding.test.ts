import { quadraticMatches } from './quadratic-funding'

function makeTxn(fromId: string, toId: string, amount: number, data?: any) {
  return { fromId, toId, amount, data }
}

test('Quadratic matches work correctly against numeric instability', () => {
  const txns = [makeTxn('a', 'b', 65, { answerId: 'c' })]
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const matches = quadraticMatches(txns, 500, 'data.answerId')
  expect(matches['c']).toEqual(0)
})

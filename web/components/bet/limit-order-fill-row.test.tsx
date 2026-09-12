import { renderToStaticMarkup } from 'react-dom/server'
import { Contract } from 'common/contract'
import { LimitOrderFillRow } from './limit-order-fill-row'

jest.mock('../widgets/info-tooltip', () => ({
  InfoTooltip: ({ text }: { text: string }) => <span title={text} />,
}))
const contract = { outcomeType: 'BINARY', token: 'MANA' } as Contract

it('uses the same stock units for the fill and total', () => {
  const html = renderToStaticMarkup(
    <LimitOrderFillRow
      contract={{ ...contract, outcomeType: 'STONK' } as Contract}
      fill={{ shares: 1000, orderCount: 1 }}
      totalShares={2000}
    />
  )
  expect(html).toContain('0.22 of 0.43 shares')
  expect(html).not.toContain('1,000')
})

it('does not label a positive tiny fill as zero shares', () => {
  const html = renderToStaticMarkup(
    <LimitOrderFillRow
      contract={contract}
      fill={{ shares: 0.9, orderCount: 1 }}
      totalShares={2000}
    />
  )
  expect(html).toContain('&lt; 1 of 2,000 shares')
  const cash = renderToStaticMarkup(
    <LimitOrderFillRow
      contract={{ ...contract, token: 'CASH' }}
      fill={{ shares: 0.004, orderCount: 1 }}
      totalShares={2000}
    />
  )
  expect(cash).toContain('&lt; 0.01 of 2,000.00 shares')
})

it('shows dependencies on other answers even with no direct limit fill', () => {
  const html = renderToStaticMarkup(
    <LimitOrderFillRow
      contract={contract}
      fill={{ shares: 0, orderCount: 0, otherAnswerOrderCount: 2 }}
      totalShares={2000}
    />
  )
  expect(html).toContain('Other-answer limit orders')
  expect(html).toContain('2 orders')
  expect(html).toContain('on other answers')
  expect(html).toContain('may differ')
  expect(html).not.toContain('0 of')
})

it('hides the row for a quote entirely against pools', () => {
  expect(
    renderToStaticMarkup(
      <LimitOrderFillRow
        contract={contract}
        fill={{ shares: 0, orderCount: 0 }}
      />
    )
  ).toBe('')
})

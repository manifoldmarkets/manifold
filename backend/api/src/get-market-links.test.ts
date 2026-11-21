jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => 'pg'),
}))
jest.mock('shared/supabase/market-links', () => ({
  getMarketLinks: jest.fn(),
}))

import { MarketLinks } from 'common/market-links'
import { getMarketLinks } from 'shared/supabase/market-links'
import { getMarketLinksHandler } from './get-market-links'

type Handler = (props: unknown) => Promise<unknown>
const handler = getMarketLinksHandler as unknown as Handler

it("reads a market's links with the child list capped", async () => {
  const links: MarketLinks = {
    parent: null,
    parentHidden: false,
    children: [],
    childCount: 0,
    hiddenChildCount: 0,
  }
  jest.mocked(getMarketLinks).mockResolvedValue(links)
  await expect(handler({ contractId: 'game' })).resolves.toBe(links)
  expect(getMarketLinks).toHaveBeenCalledWith('pg', 'game', 50)
})

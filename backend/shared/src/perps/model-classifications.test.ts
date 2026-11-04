jest.mock('common/perps/open-weight-models', () => ({
  OPEN_WEIGHT_MODELS: {
    'published/open': { open: true, weights: 'published/open' },
    'published/closed': { open: false },
  },
  basePermaslug: (slug: string) => slug.split(':', 1)[0],
  isCompositeSlug: (slug: string) => slug === 'openrouter/auto',
}))

import { getProvisionalClassifications } from './model-classifications'
import type { SupabaseDirectClient } from 'shared/supabase/init'

test('stops researching watched rows once the published seed owns their verdict', async () => {
  const rows = [
    'published/open',
    'published/closed:free',
    'openrouter/auto',
    'new-lab/preview',
  ].map((permaslug) => ({
    permaslug,
    open: false,
    provisional: true,
    classified_at: '2026-10-01T00:00:00Z',
    evidence: {},
  }))
  const pg = {
    manyOrNone: jest.fn().mockResolvedValue(rows),
  } as unknown as SupabaseDirectClient
  const candidates = await getProvisionalClassifications(pg)
  expect(candidates.map((row) => row.permaslug)).toEqual(['new-lab/preview'])
})

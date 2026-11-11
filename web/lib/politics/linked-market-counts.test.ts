import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countLinkedMarkets } from './linked-market-counts'

const status = (
  id: string,
  extra: Partial<{
    visibility: string | null
    resolution: string | null
    deleted: boolean | null
  }> = {}
) => ({ id, visibility: 'public', resolution: null, deleted: false, ...extra })

test('counts only open public children, per parent', () => {
  const counts = countLinkedMarkets(
    [
      { parent_contract_id: 'tx', child_contract_id: 'margin' },
      { parent_contract_id: 'tx', child_contract_id: 'turnout' },
      { parent_contract_id: 'tx', child_contract_id: 'resolved' },
      { parent_contract_id: 'tx', child_contract_id: 'unlisted' },
      { parent_contract_id: 'tx', child_contract_id: 'deleted' },
      { parent_contract_id: 'mi', child_contract_id: 'el-sayed' },
    ],
    [
      status('margin'),
      status('turnout'),
      status('resolved', { resolution: 'YES' }),
      status('unlisted', { visibility: 'unlisted' }),
      status('deleted', { deleted: true }),
      status('el-sayed', { visibility: null }),
    ]
  )
  assert.deepEqual(counts, { tx: 2, mi: 1 })
})

test('a link whose child was not returned counts for nothing', () => {
  assert.deepEqual(
    countLinkedMarkets(
      [{ parent_contract_id: 'tx', child_contract_id: 'gone' }],
      []
    ),
    {}
  )
  assert.deepEqual(countLinkedMarkets([], []), {})
})

import { chunk } from 'lodash'
import { rankVersusPositionUsers } from '../versus-positions'
import { convertContractMetricRows } from './contract-metrics'
import { run, SupabaseClient } from './utils'

export async function getVersusPositionUsers(
  contractId: string,
  db: SupabaseClient,
  mainAnswerId: string,
  otherAnswerId: string
) {
  const rows: Parameters<typeof rankVersusPositionUsers>[0] = []
  const pageSize = 1000
  // Rank the combined holdings, not each answer independently. Only fetch
  // identities and share totals here; full details are loaded for each page.
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await run(
      db
        .from('user_contract_metrics')
        .select('user_id, answer_id, total_shares_yes, total_shares_no')
        .eq('contract_id', contractId)
        .eq('has_shares', true)
        .in('answer_id', [mainAnswerId, otherAnswerId])
        .order('user_id')
        .order('answer_id')
        .range(offset, offset + pageSize - 1)
    )
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rankVersusPositionUsers(rows, mainAnswerId, otherAnswerId)
}

export async function getVersusPositionMetrics(
  contractId: string,
  db: SupabaseClient,
  answerIds: string[],
  userIds: string[]
) {
  const pages = await Promise.all(
    chunk(userIds, 100).map(async (ids) => {
      const { data } = await run(
        db
          .from('user_contract_metrics')
          .select('*')
          .eq('contract_id', contractId)
          .in('answer_id', answerIds)
          .in('user_id', ids)
      )
      return data
    })
  )
  // Include both metrics even if one has no remaining shares: its cost
  // basis and last trade still belong to this user's combined position.
  return convertContractMetricRows(pages.flat())
}

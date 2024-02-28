import { APIResponse } from 'common/api/schema'
import {
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
} from 'common/partner'
import { api } from 'web/lib/firebase/api'
import { PARTNER_USER_IDS } from 'common/envs/constants'

export async function getStaticProps() {
  const partnerStats = await Promise.all(
    PARTNER_USER_IDS.map((userId) => api('get-partner-stats', { userId }))
  )
  return {
    props: {
      partnerStats,
    },
    revalidate: 60, // Regenerate after a minute
  }
}

const PartnerLeaderboard = (props: {
  partnerStats: APIResponse<'get-partner-stats'>[]
}) => {
  const { partnerStats } = props

  const sortedPartnerStats = partnerStats.sort((a, b) => {
    const referralIncomeA = a.numReferrals
    const totalTraderIncomeA =
      a.numBinaryBettors * PARTNER_UNIQUE_TRADER_BONUS +
      a.numMultiChoiceBettors * PARTNER_UNIQUE_TRADER_BONUS_MULTI
    const dollarsEarnedA = totalTraderIncomeA + referralIncomeA

    const referralIncomeB = b.numReferrals
    const totalTraderIncomeB =
      b.numBinaryBettors * PARTNER_UNIQUE_TRADER_BONUS +
      b.numMultiChoiceBettors * PARTNER_UNIQUE_TRADER_BONUS_MULTI
    const dollarsEarnedB = totalTraderIncomeB + referralIncomeB

    return dollarsEarnedB - dollarsEarnedA
  })
  return (
    <div className="mx-auto max-w-4xl p-4">
      <h2 className="mb-4 text-center text-2xl font-semibold">
        Partners Leaderboard
      </h2>
      <div className="overflow-x-auto">
        <table className="whitespace-no-wrap w-full table-auto text-left">
          <thead className="border-b bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Markets</th>
              <th className="px-4 py-3">Traders</th>
              <th className="px-4 py-3">Referrals</th>
              <th className="px-4 py-3">Income ($)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm">
            {sortedPartnerStats.map((partnerStats, index) => {
              const {
                username,
                numContractsCreated,
                numUniqueBettors,
                numBinaryBettors,
                numMultiChoiceBettors,
                numReferrals,
              } = partnerStats

              const referralIncome = numReferrals
              const totalTraderIncome =
                numBinaryBettors * PARTNER_UNIQUE_TRADER_BONUS +
                numMultiChoiceBettors * PARTNER_UNIQUE_TRADER_BONUS_MULTI
              const dollarsEarned = totalTraderIncome + referralIncome

              return (
                <tr key={index} className="bg-white">
                  <td className="px-4 py-3">
                    <a
                      className="hover:underline"
                      href={`/${username}/partner`}
                    >
                      {username}
                    </a>
                  </td>
                  <td className="px-4 py-3">{numContractsCreated}</td>
                  <td className="px-4 py-3">{numUniqueBettors}</td>
                  <td className="px-4 py-3">{numReferrals}</td>
                  <td className="px-4 py-3">${dollarsEarned.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default PartnerLeaderboard

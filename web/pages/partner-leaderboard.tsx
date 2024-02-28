import React from 'react'
import { APIResponse } from 'common/api/schema'
import {
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
} from 'common/partner'

const Leaderboard = (props: { data: APIResponse<'get-partner-stats'>[] }) => {
  return (
    <div>
      <h2>Partners Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Partner Name</th>
            <th>Markets Created</th>
            <th>Traders</th>
            <th>Referrals</th>
            <th>Total Income ($)</th>
          </tr>
        </thead>
        <tbody>
          {props.data.map((partnerData, index) => {
            const {
              username,
              numContractsCreated,
              numUniqueBettors,
              numBinaryBettors,
              numMultiChoiceBettors,
              numReferrals,
            } = partnerData

            const referralIncome = numReferrals
            const totalTraderIncome =
              numBinaryBettors * PARTNER_UNIQUE_TRADER_BONUS +
              numMultiChoiceBettors * PARTNER_UNIQUE_TRADER_BONUS_MULTI
            const dollarsEarned = totalTraderIncome + referralIncome

            return (
              <tr key={index}>
                <td>{username}</td> <td>{numContractsCreated}</td>
                <td>{numUniqueBettors}</td>
                <td>{numReferrals}</td>
                <td>${dollarsEarned.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default Leaderboard

import { useEffect, useState } from 'react'
import { db } from '../lib/supabase/db'
import { usePersistentLocalState } from './use-persistent-local-state'

export type MonthlyBetsType = {
  month: string
  bet_count: number
  total_amount: number
}

async function getMonthlyBets(userId: string) {
  const { data, error } = await db.rpc('get_monthly_bet_count_and_amount', {
    user_id_input: userId,
  })
  if (error) {
    console.error('Error fetching monthly bets:', error)
    // Handle the error appropriately
    return null
  }
  const monthlyBets: MonthlyBetsType[] = []

  for (let month = 0; month < 12; month++) {
    // Construct the date for the first day of each month at midnight UTC
    const monthDate = new Date(Date.UTC(2023, month, 1))

    // Find if the month exists in the data
    const formattedMonth = monthDate.toISOString().substring(0, 7)
    const monthData = ((data as MonthlyBetsType[]) ?? []).find((d) =>
      d.month.startsWith(formattedMonth)
    )

    // If the month is present in the data, use its bet count; otherwise, default to 0
    monthlyBets.push({
      month: `${formattedMonth}-01T00:00:00.000Z`, // ISO string for the first of the month in UTC
      bet_count: monthData ? monthData.bet_count : 0,
      total_amount: monthData ? monthData.total_amount : 0,
    })
  }

  return monthlyBets
}

export function useMonthlyBets(userId: string) {
  const [monthlyBets, setMonthlyBets] = usePersistentLocalState<
    MonthlyBetsType[] | undefined | null
  >(undefined, `wrapped-2023-${userId}-monthly-bets`)
  useEffect(() => {
    getMonthlyBets(userId).then((data) => {
      setMonthlyBets((data as MonthlyBetsType[]) ?? [])
    })
  }, [userId])

  return monthlyBets
}

export function useTotalProfit(userId: string) {
  const [totalProfit, setTotalProfit] = usePersistentLocalState<
    number | undefined | null
  >(undefined, `wrapped-2023-${userId}-total-profit`)
  useEffect(() => {
    db.rpc('calculate_user_profit_for_2023', {
      user_id_input: userId,
    }).then((data) => {
      if (data.error || !data.data) {
        console.error('Error fetching total profit:', data.error)
        // Handle the error appropriately
        setTotalProfit(null)
      } else {
        setTotalProfit(data.data as number)
      }
    })
  }, [userId])

  return totalProfit
}

async function getMaxProfitContractMetric(userId: string) {
  const { data, error } = await db
    .from('user_contract_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('fs_updated_time', '2023-01-01T00:00:00Z')
    .lt('fs_updated_time', '2024-01-01T00:00:00Z')
    .order('profit', { ascending: false })
    .limit(1)

  if (error) {
    console.error(error)
    return null
  }
  return data
}

async function getMinProfitMetric(userId: string) {
  const { data, error } = await db
    .from('user_contract_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('fs_updated_time', '2023-01-01T00:00:00Z')
    .lt('fs_updated_time', '2024-01-01T00:00:00Z')
    .order('profit', { ascending: true })
    .limit(1)

  if (error) {
    console.error(error)
    return null
  }
  return data
}

export type ProfitType = {
  profit: number
  contractId: string
  hasYesShares: boolean | null
  hasNoShares: boolean | null
}

export function useMaxAndMinProfit(userId: string) {
  const [maxProfit, setMaxProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2023-${userId}-max-profit`)
  const [minProfit, setMinProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2023-${userId}-min-profit`)
  useEffect(() => {
    getMaxProfitContractMetric(userId).then((data) => {
      if (data) {
        setMaxProfit({
          profit: data[0].profit ?? 0,
          contractId: data[0].contract_id,
          hasNoShares: data[0].has_no_shares,
          hasYesShares: data[0].has_yes_shares,
        })
      }
    })
    getMinProfitMetric(userId).then((data) => {
      if (data) {
        setMinProfit({
          profit: data[0].profit ?? 0,
          contractId: data[0].contract_id,
          hasNoShares: data[0].has_no_shares,
          hasYesShares: data[0].has_yes_shares,
        })
      }
    })
  }, [userId])

  return { maxProfit, minProfit }
}

import { Contract } from 'common/contract'
import { Row as rowFor } from 'common/supabase/utils'
import { useEffect } from 'react'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { usePersistentLocalState } from './use-persistent-local-state'

export type MonthlyBetsType = {
  month: string
  bet_count: number
  total_amount: number
}

async function getMonthlyBets(userId: string) {
  const dataMap = new Map<string, MonthlyBetsType>()

  try {
    const data = await api('get-monthly-bets-2025', { userId })
    data?.forEach((item) => {
      const monthKey = item.month.substring(0, 7)
      dataMap.set(monthKey, item)
    })
  } catch (e) {
    console.error('Error fetching monthly bets:', e)
  }

  return Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(Date.UTC(2025, month, 1))
    const formattedMonth = monthDate.toISOString().substring(0, 7)
    const monthData = dataMap.get(formattedMonth)

    return {
      month: `${formattedMonth}-01T00:00:00.000Z`,
      bet_count: monthData?.bet_count ?? 0,
      total_amount: monthData?.total_amount ?? 0,
    }
  })
}

export function useMonthlyBets(userId: string) {
  const [monthlyBets, setMonthlyBets] = usePersistentLocalState<
    MonthlyBetsType[] | undefined | null
  >(undefined, `wrapped-2025-${userId}-monthly-bets`)
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
  >(undefined, `wrapped-2025-${userId}-total-profit`)
  useEffect(() => {
    getTotalProfit(userId).then((data) => {
      setTotalProfit(data)
    })
  }, [userId])

  return totalProfit
}

async function getTotalProfit(userId: string) {
  const { data: yearStart, error: error1 } = await db
    .from('user_portfolio_history')
    .select('*')
    .eq('user_id', userId)
    .gte('ts', '2025-01-01')
    .order('ts', { ascending: true })
    .limit(1)

  const { data: yearEnd, error: error2 } = await db
    .from('user_portfolio_history')
    .select('*')
    .eq('user_id', userId)
    .lte('ts', '2025-12-31 23:59:59')
    .order('ts', { ascending: false })
    .limit(1)

  if (error1 || error2) {
    console.error(error1 ?? error2)
    return null
  }

  const yearStartRow = (yearStart as any)[0] as rowFor<'user_portfolio_history'>
  const yearEndRow = (yearEnd as any)[0] as rowFor<'user_portfolio_history'>

  return calculateTotalProfit(yearEndRow) - calculateTotalProfit(yearStartRow)
}

function calculateTotalProfit(
  portfolioHistoryRow: rowFor<'user_portfolio_history'>
) {
  if (!portfolioHistoryRow) return 0
  return (
    (portfolioHistoryRow.investment_value ?? 0) +
    (portfolioHistoryRow.balance ?? 0) -
    (portfolioHistoryRow.total_deposits ?? 0)
  )
}

async function getMaxMinProfitMetric2025(userId: string) {
  try {
    const data = await api('get-max-min-profit-2025', { userId })
    return data
  } catch (error) {
    console.error('Error fetching max/min profit metrics:', error)
    return null
  }
}

export type ProfitType = {
  profit: number
  contract: Contract
  hasYesShares: boolean | null
  hasNoShares: boolean | null
  answerId: string | null
}

export function useMaxAndMinProfit(userId: string) {
  const [maxProfit, setMaxProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2025-${userId}-max-profit`)
  const [minProfit, setMinProfit] = usePersistentLocalState<
    ProfitType | undefined | null
  >(undefined, `wrapped-2025-${userId}-min-profit`)

  function translateProfitObject(
    profitObject: {
      profit: number
      data: Contract
      has_no_shares: boolean
      has_yes_shares: boolean
      answer_id: string | null
    } | null
  ) {
    if (!profitObject) return null
    return {
      profit: profitObject.profit ?? 0,
      contract: profitObject.data,
      hasNoShares: profitObject.has_no_shares,
      hasYesShares: profitObject.has_yes_shares,
      answerId: profitObject.answer_id,
    }
  }

  useEffect(() => {
    getMaxMinProfitMetric2025(userId).then((data) => {
      const [max, min] = data && data.length > 0 ? data : [null, null]
      setMaxProfit(translateProfitObject(max))
      setMinProfit(translateProfitObject(min))
    })
  }, [userId])

  return { maxProfit, minProfit }
}


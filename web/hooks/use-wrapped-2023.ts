import { useEffect, useState } from 'react'
import { db } from '../lib/supabase/db'

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
  const [monthlyBets, setMonthlyBets] = useState<
    MonthlyBetsType[] | undefined | null
  >(undefined)
  useEffect(() => {
    getMonthlyBets(userId).then((data) => {
      console.log('RES', data)
      setMonthlyBets((data as MonthlyBetsType[]) ?? [])
    })
  }, [userId])

  return monthlyBets
}

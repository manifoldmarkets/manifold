import { useState, useEffect } from 'react'
import { initSupabaseClient } from 'web/lib/supabase/db'

type Report = {
  report_id: number
  created_time: string
  comment_id: string
  contract_id: string
  user_id: string
  status: 'new' | 'under review' | 'resolved' | 'needs admin'
}

const useFetchReports = () => {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReports = async () => {
      const { data, error } = await initSupabaseClient()
        .from('mod_reports')
        .select('*')
        .order('created_time', { ascending: false })

      if (error) {
        console.error('Error fetching reports:', error)
      } else {
        setReports(data as Report[])
      }
      setLoading(false)
    }

    fetchReports()
  }, [])

  return { reports, loading }
}

export default useFetchReports

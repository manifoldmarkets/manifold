import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { ModReport, ReportStatus } from 'common/src/mod-report'
import { keyBy, mapValues } from 'lodash'
import { getReports, LiteReport } from 'web/pages/admin/reports'

export const useModReports = (statuses: ReportStatus[]) => {
  const [reports, setReports] = useState<ModReport[] | undefined>(undefined)
  const [userReports, setUserReports] = useState<LiteReport[] | undefined>(
    undefined
  )
  const [reportStatuses, setReportStatuses] = useState<{
    [key: number]: ReportStatus
  }>({})
  const [modNotes, setModNotes] = useState<{
    [key: number]: string | undefined
  }>({})
  const [isLoadingUserReports, setIsLoadingUserReports] = useState(true)

  const getModReports = async () => {
    try {
      const response = await api('get-mod-reports', {
        statuses,
        limit: 50,
        offset: 0,
      })
      if (response && response.status === 'success') {
        const newReports = response.reports

        const sortedReports = newReports.sort(
          (a: ModReport, b: ModReport) =>
            new Date(b.created_time).getTime() -
            new Date(a.created_time).getTime()
        )

        setReports(sortedReports)

        const reportsById = keyBy(sortedReports, 'report_id')
        const initialStatuses = mapValues(reportsById, (r) => r.status)
        const initialNotes = mapValues(reportsById, (r) => r.mod_note)

        setReportStatuses(initialStatuses)
        setModNotes(initialNotes)
      } else {
        console.error('Failed to fetch reports:', response)
      }
    } catch (error) {
      console.error('Error fetching reports:', error)
    }
  }

  const getUserReports = async () => {
    setIsLoadingUserReports(true)
    try {
      const response = await getReports({ limit: 40 })
      if (response) {
        setUserReports(response)
      } else {
        console.error('Failed to fetch user reports:', response)
      }
    } catch (error) {
      console.error('Error fetching user reports:', error)
    } finally {
      setIsLoadingUserReports(false)
    }
  }

  useEffect(() => {
    getModReports()
    getUserReports()
  }, [JSON.stringify(statuses)])

  return {
    reports,
    userReports,
    initialLoading: reports === undefined,
    isLoadingUserReports,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  }
}

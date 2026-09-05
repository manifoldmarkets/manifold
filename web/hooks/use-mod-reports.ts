import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { ModReport, ReportStatus } from 'common/src/mod-report'
import { keyBy, mapValues } from 'lodash'

export const useModReports = (
  statuses: ReportStatus[],
  order: 'asc' | 'desc' = 'desc'
) => {
  const [reports, setReports] = useState<ModReport[] | undefined>(undefined)
  const [reportStatuses, setReportStatuses] = useState<{
    [key: number]: ReportStatus
  }>({})
  const [modNotes, setModNotes] = useState<{
    [key: number]: string | undefined
  }>({})

  const getModReports = async () => {
    if (statuses.length === 0) {
      setReports([])
      return
    }
    try {
      const response = await api('get-mod-reports', {
        statuses,
        limit: 50,
        offset: 0,
        order,
      })
      if (response && response.status === 'success') {
        const newReports = response.reports

        const sortedReports = newReports.sort((a: ModReport, b: ModReport) => {
          const diff =
            new Date(a.created_time).getTime() -
            new Date(b.created_time).getTime()
          return order === 'asc' ? diff : -diff
        })

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

  useEffect(() => {
    getModReports()
  }, [JSON.stringify(statuses), order])

  return {
    reports,
    initialLoading: reports === undefined,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  }
}

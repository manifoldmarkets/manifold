import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { ModReport, ReportStatus } from 'common/mod-report'
import { keyBy, mapValues } from 'lodash'

const REPORTS_BATCH_SIZE = 50

/** The key must include every input that changes which reports are fetched. */
export function useReportPages<T, Cursor>(
  key: string,
  fetchPage: (cursor?: Cursor) => Promise<{
    reports: T[]
    nextCursor?: Cursor
  }>,
  enabled = true
) {
  const [request, setRequest] = useState<{ key: string; cursor?: Cursor }>({
    key,
  })
  const [state, setState] = useState<{
    key: string
    reports?: T[]
    nextCursor?: Cursor
    isLoading: boolean
    error: boolean
  }>({ key, isLoading: enabled, error: false })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const cursor =
      request.key === key && state.key === key ? request.cursor : undefined
    setState((prev) => ({
      key,
      reports:
        cursor !== undefined && prev.key === key ? prev.reports : undefined,
      nextCursor: cursor,
      isLoading: true,
      error: false,
    }))
    fetchPage(cursor)
      .then((page) => {
        if (cancelled) return
        setState((prev) => ({
          key,
          reports:
            cursor === undefined
              ? page.reports
              : [...(prev.reports ?? []), ...page.reports],
          nextCursor: page.nextCursor,
          isLoading: false,
          error: false,
        }))
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Error fetching reports:', error)
        setState((prev) => ({ ...prev, isLoading: false, error: true }))
      })
    return () => {
      cancelled = true
    }
  }, [key, enabled, request])

  const current = state.key === key ? state : undefined
  return {
    reports: current?.reports,
    isLoading: enabled && (current?.isLoading ?? true),
    error: current?.error ?? false,
    hasMore: current?.nextCursor !== undefined,
    // Also retries the initial request when its cursor is undefined.
    loadMore: () => {
      if (!enabled || current?.isLoading) return
      setRequest({ key, cursor: current?.nextCursor })
    },
  }
}

export const useModReports = (
  statuses: ReportStatus[],
  order: 'asc' | 'desc' = 'desc',
  enabled = true
) => {
  const key = JSON.stringify([statuses, order])
  const pages = useReportPages<
    ModReport,
    { cursorTime: string; cursorId: number }
  >(
    key,
    async (cursor) => {
      if (statuses.length === 0) return { reports: [] }
      const response = await api('get-mod-reports', {
        statuses,
        limit: REPORTS_BATCH_SIZE,
        order,
        ...cursor,
      })
      if (response.status !== 'success')
        throw new Error('Failed to fetch reports')
      const last = response.reports.at(-1)
      return {
        reports: response.reports,
        nextCursor:
          response.reports.length === REPORTS_BATCH_SIZE && last
            ? { cursorTime: last.created_time, cursorId: last.report_id }
            : undefined,
      }
    },
    enabled
  )
  const [statusChanges, setReportStatuses] = useState<
    Record<number, ReportStatus>
  >({})
  const [noteChanges, setModNotes] = useState<
    Record<number, string | undefined>
  >({})
  useEffect(() => {
    setReportStatuses({})
    setModNotes({})
  }, [key])

  const reportsById = keyBy(pages.reports, 'report_id')
  const reportStatuses: Record<number, ReportStatus> = {
    ...mapValues(reportsById, (r) => r.status),
    ...statusChanges,
  }
  const modNotes: Record<number, string | undefined> = {
    ...mapValues(reportsById, (r) => r.mod_note),
    ...noteChanges,
  }
  return {
    ...pages,
    initialLoading: pages.isLoading && pages.reports === undefined,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  }
}

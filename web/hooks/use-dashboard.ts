import { useEffect, useState } from 'react'
import { useIsAuthorized } from './use-user'
import { Dashboard } from 'common/dashboard'
import { getDashboardFromSlug, getYourDashboards } from 'web/lib/firebase/api'
import { getYourFollowedDashboards } from 'web/lib/firebase/api'

export function useDashboardFromSlug(slug: string) {
  const [dashboard, setDashboard] = useState<Dashboard>()

  useEffect(() => {
    getDashboardFromSlug({ dashboardSlug: slug }).then((result) => {
      setDashboard(result as Dashboard)
    })
  }, [slug])

  return dashboard
}

export function useYourDashboards() {
  const isAuth = useIsAuthorized()

  const [yourDashboards, setYourDashboards] = useState<Dashboard[] | undefined>(
    undefined
  )

  useEffect(() => {
    if (!isAuth) return
    getYourDashboards().then((results) => {
      setYourDashboards(results.dashboards as Dashboard[])
    })
  }, [isAuth])

  return yourDashboards
}

export function useYourFollowedDashboards() {
  const isAuth = useIsAuthorized()

  const [followedDashboards, setFollowedDashboards] = useState<
    Dashboard[] | undefined
  >(undefined)

  useEffect(() => {
    if (!isAuth) return
    getYourFollowedDashboards().then((results) => {
      setFollowedDashboards(results.dashboards as Dashboard[])
    })
  }, [isAuth])

  return followedDashboards
}

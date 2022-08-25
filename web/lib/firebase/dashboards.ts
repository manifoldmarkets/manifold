import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { Dashboard } from 'common/dashboard'
import { coll, getValue } from './utils'

export const dashboards = coll<Dashboard>('dashboards')

export function dashboardPath(dashboardSlug: string) {
  return `/dashboard/${dashboardSlug}}`
}

export function updateDashboard(
  dashboard: Dashboard,
  updates: Partial<Dashboard>
) {
  return updateDoc(doc(dashboards, dashboard.id), updates)
}

export function deleteDashboard(dashboard: Dashboard) {
  return deleteDoc(doc(dashboards, dashboard.id))
}

export function getDashboard(dashboardId: string) {
  return getValue<Dashboard>(doc(dashboards, dashboardId))
}

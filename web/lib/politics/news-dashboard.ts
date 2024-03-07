import { api } from 'web/lib/firebase/api'
import { DashboardLinkItem, DashboardQuestionItem } from 'common/dashboard'
import { fetchLinkPreviews } from 'common/link-preview'
import { getContracts } from 'web/lib/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { capitalize, omit } from 'lodash'
import { TOP_SLUG } from 'web/pages/politics/[[...slug]]'

export const getDashboardProps = async (slug: string, isPolitics?: boolean) => {
  const dashboard = await api('get-dashboard-from-slug', {
    dashboardSlug: slug,
  })

  const links = dashboard.items
    .filter((item): item is DashboardLinkItem => item.type === 'link')
    .map((item) => item.url)

  const questionSlugs = dashboard.items
    .filter((item): item is DashboardQuestionItem => item.type === 'question')
    .map((item) => item.slug)
    .slice(0, 20) // preload just the first n questions

  const previews = await fetchLinkPreviews(links)
  const fullContracts = await getContracts(questionSlugs, 'slug')
  const contracts = fullContracts.map((c) =>
    // remove some heavy fields that are not needed for the cards
    removeUndefinedProps(omit(c, 'description', 'coverImageUrl'))
  )

  const headlines = await api(
    isPolitics ? 'politics-headlines' : 'headlines',
    {}
  )
  if (isPolitics) {
    headlines.unshift({
      id: TOP_SLUG,
      slug: '',
      title: capitalize(TOP_SLUG),
    })
  }
  return {
    state: 'success',
    initialDashboard: dashboard,
    headlines,
    previews,
    initialContracts: contracts,
    slug,
  }
}

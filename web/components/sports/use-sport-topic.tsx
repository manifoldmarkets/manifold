import clsx from 'clsx'
import { Group } from 'common/group'
import { SPORTS_DEFAULT_GROUP_ID, SportInfo } from 'common/sports-schedule'
import { buildArray } from 'common/util/array'
import { Tab } from 'web/components/layout/tabs'
import {
  MOD_ACTION_TEXT_CLASS,
  ModActionBadge,
} from 'web/components/moderation/mod-action'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { SportFollowButton } from './sport-follow-button'
import { SportTopicPanel } from './sport-topic-panel'
import { SportsLeaderboards } from './sports-leaderboards'

/**
 * What a sports page has from its topic: the Follow button, and the tabs
 * after its own (Leaderboards for everyone, Topic for mods).
 */
export function useSportTopicExtras(sport: SportInfo | 'all' | undefined): {
  follow: React.ReactNode
  tabs: Tab[]
} {
  const topic = useSportTopic(sport)
  const isMod = useAdminOrMod()
  return {
    follow: topic && <SportFollowButton topic={topic} />,
    tabs: buildArray<Tab>(
      sport && {
        title: 'Leaderboards',
        queryString: 'leaderboards',
        content: (
          <div className="pt-3">
            <SportsLeaderboards sport={sport} />
          </div>
        ),
      },
      isMod &&
        topic && {
          title: 'Topic',
          queryString: 'topic',
          tooltip: 'Only mods see this tab',
          inlineTabIcon: (
            <ModActionBadge className={clsx('ml-1', MOD_ACTION_TEXT_CLASS)} />
          ),
          content: (
            <div className="pt-3">
              <SportTopicPanel key={topic.id} topic={topic} />
            </div>
          ),
        }
    ),
  }
}

/**
 * The topic behind a sports page: Sports on /sports, the sport's main topic
 * on a sport's page. People follow it from the page, and mods edit it there,
 * since its topic page sends them to the sports page. Undefined while it
 * loads, and for a sport with no topic of its own.
 */
export function useSportTopic(
  sport: SportInfo | 'all' | undefined
): Group | undefined {
  const all = sport === 'all'
  const slug = sport && sport !== 'all' ? sport.slug : undefined
  // Their own cache slots, so one sport's topic never shows on another's page.
  const root = useAPIGetter(
    'group/by-id/:id',
    all ? { id: SPORTS_DEFAULT_GROUP_ID } : undefined,
    undefined,
    'sports-topic-all'
  )
  const main = useAPIGetter(
    'group/:slug',
    slug ? { slug } : undefined,
    undefined,
    `sports-topic-${slug ?? ''}`
  )
  if (all)
    return root.data?.id === SPORTS_DEFAULT_GROUP_ID ? root.data : undefined
  return slug && main.data?.slug === slug ? main.data : undefined
}

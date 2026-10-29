import clsx from 'clsx'
import { Group } from 'common/group'
import {
  SPORTS_DEFAULT_GROUP_ID,
  SportInfo,
  SportsSubtopic,
} from 'common/sports-schedule'
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

/** What a sports page shows: every sport, one sport, or a topic under one. */
export type SportsPageScope = {
  sport: SportInfo | 'all'
  topic?: SportsSubtopic
}

/**
 * What a sports page has from its topic: the Follow button, and the tabs
 * after its own (Leaderboards for everyone, Topic for mods). Nothing until
 * the page knows what it shows.
 */
export function useSportTopicExtras(scope: SportsPageScope | undefined): {
  follow: React.ReactNode
  tabs: Tab[]
} {
  const topic = useSportTopic(scope)
  const isMod = useAdminOrMod()
  const board = scope?.topic
    ? `topic-${scope.topic.id}`
    : scope?.sport === 'all'
    ? 'all'
    : scope?.sport.key
  return {
    follow: topic && <SportFollowButton topic={topic} />,
    tabs: buildArray<Tab>(
      scope && {
        title: 'Leaderboards',
        queryString: 'leaderboards',
        content: (
          <div className="pt-3">
            {/* Remount per board: its cached board is read on mount. */}
            <SportsLeaderboards
              key={board}
              sport={scope.sport}
              topic={scope.topic}
            />
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
 * on a sport's page, the topic itself on a topic's page. People follow it
 * from the page, and mods edit it there, since its topic page sends them to
 * the sports page. Undefined while it loads, and for a sport with no topic of
 * its own.
 */
export function useSportTopic(
  scope: SportsPageScope | undefined
): Group | undefined {
  const all = scope?.sport === 'all' && !scope.topic
  const slug =
    scope?.topic?.slug ??
    (scope && scope.sport !== 'all' ? scope.sport.slug : undefined)
  // Their own cache slots, so one page's topic never shows on another's.
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

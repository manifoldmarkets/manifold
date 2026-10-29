import { keyBy, uniq } from 'lodash'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo } from 'react'
import {
  SportInfo,
  sportPath,
  SportsSubtopic,
  sportTopicPath,
} from 'common/sports-schedule'
import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { GameFeed } from 'web/components/sports/schedule-list'
import { SportMarkets, SportsShell } from 'web/components/sports/sports-shell'
import { TopicRail, useSportsIndex } from 'web/components/sports/topic-rail'
import { useSportTopicExtras } from 'web/components/sports/use-sport-topic'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useSportsSchedule } from 'web/hooks/use-sports-schedule'
import { useUser } from 'web/hooks/use-user'

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v

/**
 * A topic under Sports that isn't a sport (a league, a season, a side topic,
 * or a topic that groups sports), under its sport: its games, its markets and
 * its leaderboards. /topic/<slug> opens this page for every such topic.
 */
export default function SportTopicPage() {
  const user = useUser()
  useSaveReferral(user)
  const router = useRouter()
  const rawSport = first(router.query.sport)
  const rawTopic = first(router.query.topic)
  const slug = rawTopic?.toLowerCase()
  useSaveScroll(`sports-${rawSport ?? ''}-${slug ?? ''}`, true)

  const { index, failed } = useSportsIndex()
  const topic = slug ? index?.topics.find((t) => t.slug === slug) : undefined
  // A sport's main topic has the sport's page.
  const mainOf = slug ? index?.sports.find((s) => s.slug === slug) : undefined
  // One URL per topic: under the sport it's filed under, keeping the tab.
  useEffect(() => {
    if (!router.isReady) return
    const tab = first(router.query.tab)
    const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
    if (topic && (rawSport !== topic.sport || rawTopic !== topic.slug))
      router.replace(sportTopicPath(topic.sport, topic.slug) + query)
    else if (!topic && mainOf) router.replace(sportPath(mainOf.key) + query)
  }, [router.isReady, topic, mainOf, rawSport, rawTopic])

  const ready = router.isReady && !!topic
  const { schedule, rail, loading, loadMore, hasMore } = useSportsSchedule(
    topic?.sport ?? 'all',
    ready,
    topic?.id
  )
  const sportsByKey = useMemo(
    () => keyBy(index?.sports ?? [], 'key'),
    [index?.sports]
  )
  const sport: SportInfo | 'all' | undefined = topic
    ? topic.sport === 'all'
      ? 'all'
      : sportsByKey[topic.sport]
    : undefined
  const scope = useMemo(
    () => (sport && topic ? { sport, topic } : undefined),
    [sport, topic]
  )
  const extras = useSportTopicExtras(scope)
  const unknown = (!!index && !topic && !mainOf) || (failed && !topic)

  if (unknown || (topic && !sport)) {
    return (
      <SportsShell
        selected="all"
        rail={rail}
        heading="Topic not found"
        subheading="Pick a sport below, or see every game."
        seo={{ title: 'Sports', description: '', url: '/sports' }}
        trackPageView="/sports/unknown-topic"
      >
        <Col className="border-ink-200 bg-canvas-0 mt-3 gap-1.5 rounded-lg border px-4 py-4">
          <span className="text-ink-900 text-sm font-semibold">
            {failed
              ? "Couldn't load the sports topics."
              : `We don't have a sports topic called "${rawTopic}".`}
          </span>
          <Link href="/sports" className="text-primary-700 text-sm">
            See every game →
          </Link>
        </Col>
      </SportsShell>
    )
  }

  const games = schedule?.games ?? []
  const hasGames = schedule ? games.length > 0 : undefined
  const showLeague = uniq(games.map((g) => g.league)).length > 1
  const info = topic && topicInfo(topic, sport)
  const markets = info && (
    <SportMarkets
      sport={info}
      upcoming={schedule?.upcoming ?? []}
      sportsByKey={sportsByKey}
      enabled={ready}
    />
  )

  return (
    <SportsShell
      selected={topic?.sport ?? rawSport ?? 'all'}
      rail={rail}
      heading={
        topic ? (
          <>
            {topic.emoji && <span className="mr-2">{topic.emoji}</span>}
            {topic.label}
          </>
        ) : (
          <span className="bg-ink-100 inline-block h-7 w-40 animate-pulse rounded align-middle" />
        )
      }
      subheading={
        topic && sport ? <PartOf topic={topic} sport={sport} /> : undefined
      }
      actions={extras.follow}
      topics={
        topic &&
        sport && (
          <TopicRail
            sport={topic.sport}
            sportLabel={sport === 'all' ? 'sports' : sport.label}
            topics={index?.topics.filter((t) => t.sport === topic.sport) ?? []}
            selected={topic.slug}
            counts={rail?.topicCounts}
          />
        )
      }
      seo={{
        title: topic?.label ?? 'Sports',
        description: topic ? `${topic.label} odds on Manifold` : '',
        url: topic
          ? sportTopicPath(topic.sport, topic.slug)
          : `/sports/${rawSport ?? ''}/${rawTopic ?? ''}`,
      }}
      trackPageView={`/sports/${rawSport ?? ''}/${slug ?? ''}`}
    >
      {topic && (
        <QueryUncontrolledTabs
          trackingName="sport topic tabs"
          tabs={[
            // Once it's clear a topic has no games (a side topic, a league
            // out of season), its page starts at its markets.
            ...(hasGames === false
              ? []
              : [
                  {
                    title: 'Games',
                    queryString: 'games',
                    content: (
                      <div className="pt-3">
                        <GameFeed
                          key={topic.id}
                          games={games}
                          loading={loading || !schedule}
                          hasMore={hasMore}
                          loadMore={loadMore}
                          showLeague={showLeague}
                          empty={markets}
                        />
                      </div>
                    ),
                  },
                ]),
            {
              title: 'Markets',
              queryString: 'markets',
              content: <div className="pt-3">{markets}</div>,
            },
            ...extras.tabs,
          ]}
        />
      )}
    </SportsShell>
  )
}

// The page's markets search the topic and every topic under it, and a market
// made from it gets the topic.
function topicInfo(
  topic: SportsSubtopic,
  sport: SportInfo | 'all' | undefined
): SportInfo {
  return {
    key: `topic-${topic.id}`,
    label: topic.label,
    longLabel: topic.label,
    emoji: topic.emoji ?? (sport && sport !== 'all' ? sport.emoji : '🏟️'),
    groupIds: topic.groupIds,
    slug: topic.slug,
  }
}

// "Part of ⚽ Soccer", or for a topic that groups sports, the sports in it.
function PartOf(props: { topic: SportsSubtopic; sport: SportInfo | 'all' }) {
  const { topic, sport } = props
  const { index } = useSportsIndex()
  if (sport !== 'all')
    return (
      <>
        Part of{' '}
        <Link href={sportPath(sport.key)} className="hover:text-primary-700">
          {sport.emoji} {sport.label}
        </Link>
      </>
    )
  const ids = new Set(topic.groupIds)
  const inside = (index?.sports ?? []).filter((s) =>
    s.groupIds.some((id) => ids.has(id))
  )
  if (inside.length === 0) return <>Part of Sports</>
  return <>Covers {listNames(inside.map((s) => s.label))}</>
}

const listNames = (names: string[]) =>
  names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

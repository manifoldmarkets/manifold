import React from 'react'
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  TextWidget,
} from 'react-native-android-widget'
import type { WidgetInfo } from 'react-native-android-widget'
import type { NativeStreakData } from 'common/native-message'
import { CRANE_DATA_URI } from './crane-data'

// Android home-screen streak widget. This is the platform-mirror of the iOS
// SwiftUI widget (native/targets/widget/index.swift): same state machine, same
// gradient palette, same copy. Android has no lock-screen widgets, so this is
// home small + medium only. These components MUST be pure functions returning
// react-native-android-widget primitives — no hooks, no state. They render from
// the snapshot passed in; the snapshot is recomputed into lit/pending/frozen
// here, so the widget stays correct hours after the last write.

// MARK: - State

type StreakState = 'lit' | 'pending' | 'frozen' | 'loggedOut'

// Most recent midnight America/Los_Angeles, in epoch ms (the streak "today"
// boundary the backend uses). Derived from the LA wall-clock time at `now` so it
// is DST-correct without a timezone library: subtract however many ms `now` is
// past LA-midnight in wall-clock terms.
function pacificStartOfDayMs(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  // '24' can appear for midnight in some engines; normalize to 0.
  const h = get('hour') % 24
  const m = get('minute')
  const s = get('second')
  const msPastMidnight = ((h * 60 + m) * 60 + s) * 1000 + now.getMilliseconds()
  return now.getTime() - msPastMidnight
}

function computeState(d: NativeStreakData | null, now: Date): StreakState {
  if (!d || !d.loggedIn || !d.streak || d.streak <= 0) return 'loggedOut'
  try {
    const startMs = pacificStartOfDayMs(now)
    if (d.lastBetTime > 0 && d.lastBetTime >= startMs) return 'lit'
    if (d.lastStreakFreezeTime > 0 && d.lastStreakFreezeTime >= startMs)
      return 'frozen'
    return 'pending'
  } catch {
    // Never throw from a render: a crash leaves the widget stuck on the loading
    // layout (the iOS "infinite shimmer" failure mode). Default to pending.
    return 'pending'
  }
}

// Milliseconds from now until the next midnight America/Los_Angeles (the streak
// reset). Drives the live countdown Chronometer in the pending state. (+24h from
// the most-recent midnight can be off by an hour on the two DST-change days; the
// app-open re-render corrects it — fine for a countdown.)
function msUntilPacificReset(now: Date): number {
  try {
    const nextMidnight = pacificStartOfDayMs(now) + 24 * 60 * 60 * 1000
    return Math.max(0, nextMidnight - now.getTime())
  } catch {
    return 0
  }
}

// Day-of-year in LA (1-366), used to deterministically rotate the hook copy.
function pacificDayOfYear(now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const get = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? 0)
    const y = get('year')
    const mo = get('month')
    const day = get('day')
    const start = Date.UTC(y, 0, 1)
    const today = Date.UTC(y, mo - 1, day)
    return Math.floor((today - start) / 86_400_000) + 1
  } catch {
    return 1
  }
}

// Rotating daily nudge on the medium widget. Mirrors hookText() in index.swift.
function hookText(state: StreakState, now: Date): string {
  if (state === 'lit') return 'Locked in. See you tomorrow 🔥'
  if (state === 'frozen') return "Saved by a freeze 🧊 — don't push your luck"
  const day = pacificDayOfYear(now)
  const pct = 55 + ((day * 7) % 40) // 55–94, deterministic by day
  const hooks = [
    `Open the app today? ${pct}% 📈`,
    `P(you predict today): ${pct}%`,
    'Resolves YES if you predict today',
    'Your streak: trading at 96%',
    `Will your streak survive the week? ${pct}%`,
    `Market says you'll bet today: ${pct}% ▲`,
    'We miss you!',
    'Your streak is lonely',
    "Don't break the chain",
    'Keep the flame alive 🔥',
    'Come back — we saved your spot',
    'The future awaits',
    'Predict the future',
    'Be less wrong',
    "What do you know that we don't?",
    'Put your mana where your mouth is',
    "Someone's wrong on the internet 👀",
  ]
  return hooks[day % hooks.length]
}

// MARK: - Palette (exact match to index.swift gradient stops)

type Gradient = {
  from: `#${string}`
  to: `#${string}`
  orientation:
    | 'TOP_BOTTOM'
    | 'TR_BL'
    | 'RIGHT_LEFT'
    | 'BR_TL'
    | 'BOTTOM_TOP'
    | 'BL_TR'
    | 'LEFT_RIGHT'
    | 'TL_BR'
}

const FLAME: Gradient = { from: '#FF8A3D', to: '#C7331A', orientation: 'TL_BR' }
const ICE: Gradient = { from: '#8FDBFF', to: '#1F5ECC', orientation: 'TL_BR' }
const GREY: Gradient = { from: '#33333A', to: '#1F1F24', orientation: 'TOP_BOTTOM' }
// Milestone "level up" gradients: the lit widget turns gold as the streak grows
// — a cheap, persistent stand-in for the campfire-growth idea (no bespoke art).
const GOLD: Gradient = { from: '#FFD24D', to: '#E0810E', orientation: 'TL_BR' }
const GOLD_RICH: Gradient = { from: '#FFE891', to: '#BC5E00', orientation: 'TL_BR' }

// Streak rank ladder — names + thresholds from the prediction-streak trophy
// (common/src/trophies.ts on the `trophies` branch). Once Spark (14 days) is hit,
// the widget shows the rank title + a trophy, and levels its gradient up to gold.
const STREAK_RANKS: { threshold: number; name: string }[] = [
  { threshold: 1065, name: 'Timeless' },
  { threshold: 700, name: 'Undying' },
  { threshold: 365, name: 'Eternal Flame' },
  { threshold: 200, name: 'Phoenix' },
  { threshold: 100, name: 'Inferno' },
  { threshold: 60, name: 'Blaze' },
  { threshold: 30, name: 'Ember' },
  { threshold: 14, name: 'Spark' },
]
function streakRank(streak: number): string | null {
  for (const r of STREAK_RANKS) if (streak >= r.threshold) return r.name
  return null
}
// tier(): 0 (<30, flame), 1 (Ember/Blaze, gold), 2 (Inferno+, rich gold) — drives
// the gradient + flame/number scaling so the widget visibly levels up.
function streakTier(streak: number): 0 | 1 | 2 {
  if (streak >= 100) return 2
  if (streak >= 30) return 1
  return 0
}

// Gradient by state, escalating to gold once lit and past a milestone. Frozen and
// pending keep their state colors (pending stays grey — grey = "act today").
function gradientFor(state: StreakState, streak: number): Gradient {
  if (state === 'frozen') return ICE
  if (state !== 'lit') return GREY // pending + loggedOut
  if (streak >= 100) return GOLD_RICH
  if (streak >= 30) return GOLD
  return FLAME
}

const WHITE = '#FFFFFF'
const WHITE_85 = 'rgba(255, 255, 255, 0.85)'
const WHITE_90 = 'rgba(255, 255, 255, 0.9)'
const WHITE_22 = 'rgba(255, 255, 255, 0.22)'
const RADIUS = 20

// Soft warm drop shadow that makes the big number pop off the gradient (the
// "hero glow"). Spread into the streak-number TextWidget style.
const NUMBER_SHADOW = {
  textShadowColor: 'rgba(20, 8, 0, 0.34)' as const,
  textShadowRadius: 7,
  textShadowOffset: { width: 0, height: 2 },
}
// Stronger, warmer glow for milestone (ranked) streaks — makes the number really
// pop off the gold.
const MILESTONE_SHADOW = {
  textShadowColor: 'rgba(90, 35, 0, 0.5)' as const,
  textShadowRadius: 11,
  textShadowOffset: { width: 0, height: 2 },
}
// Pale-gold rim used to "frame" milestone widgets (a solid outer layer behind the
// gradient, since backgroundGradient overrides borders).
const FRAME_GOLD: `#${string}` = '#FFE6A8'

function glyph(state: StreakState): string {
  return state === 'frozen' ? '🧊' : '🔥'
}

// MARK: - Layouts

// Shared shell: gradient background + faint crane watermark (bottom-right) +
// tap-to-open. Content stacks on top via OverlapWidget (gradient → crane →
// content). Mirrors the iOS containerBackground (gradient + crane watermark).
function Shell({
  gradient,
  craneSize,
  clickData,
  frame,
  children,
}: {
  gradient: Gradient
  craneSize: number
  clickData?: Record<string, unknown>
  frame?: `#${string}`
  children: any
}) {
  const inner = (
    <OverlapWidget
      clickAction="OPEN_APP"
      clickActionData={clickData}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: gradient,
        borderRadius: frame ? RADIUS - 3 : RADIUS,
      }}
    >
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
        }}
      >
        <ImageWidget
          image={CRANE_DATA_URI}
          imageWidth={craneSize}
          imageHeight={craneSize}
          style={{ marginRight: 2, marginBottom: 4 }}
        />
      </FlexWidget>
      {children}
    </OverlapWidget>
  )
  if (!frame) return inner
  // Frame: a solid pale-gold layer behind the gradient gives milestone widgets a
  // premium rim (a real border can't sit on a gradient background in this lib).
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: frame,
        borderRadius: RADIUS,
        padding: 3,
      }}
    >
      {inner}
    </FlexWidget>
  )
}

// Milestone badge — a sparkle + a big trophy, shown once a streak rank (Spark,
// 14 days) is reached. Bigger + flashier on the small widget where there's room
// top-right.
function MilestoneBadge({ big }: { big?: boolean }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextWidget text="✨" style={{ fontSize: big ? 16 : 13 }} />
      <TextWidget
        text="🏆"
        style={{ fontSize: big ? 32 : 26, marginLeft: 2, ...NUMBER_SHADOW }}
      />
    </FlexWidget>
  )
}

// Small (home): vertical, left-aligned — glyph, big number, "day streak",
// optional frozen line, over a faint crane. Logged-out shows the invite.
function SmallWidget({
  state,
  data,
  clickData,
}: {
  state: StreakState
  data: NativeStreakData | null
  clickData?: Record<string, unknown>
}) {
  const contentStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
    alignItems: 'flex-start' as const,
    padding: 14,
  }
  if (state === 'loggedOut' || !data) {
    return (
      <Shell gradient={GREY} craneSize={84} clickData={clickData}>
        <FlexWidget style={contentStyle}>
          <TextWidget text="🔥" style={{ fontSize: 42 }} />
          <TextWidget
            text="Start a streak"
            maxLines={2}
            style={{ fontSize: 18, fontWeight: '900', color: WHITE, marginTop: 8 }}
          />
          <TextWidget
            text="Open Manifold"
            style={{ fontSize: 12, fontWeight: '600', color: WHITE_85, marginTop: 2 }}
          />
        </FlexWidget>
      </Shell>
    )
  }
  const tier = streakTier(data.streak)
  const flameSize = 40 + tier * 4
  const numberSize = 48 + tier * 4
  const rank = streakRank(data.streak)
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={84}
      clickData={clickData}
      frame={state === 'lit' && tier >= 1 ? FRAME_GOLD : undefined}
    >
      <FlexWidget style={contentStyle}>
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <TextWidget text={glyph(state)} style={{ fontSize: flameSize }} />
          {rank ? <MilestoneBadge big /> : null}
        </FlexWidget>
        <TextWidget
          text={`${data.streak}`}
          maxLines={1}
          style={{
            fontSize: numberSize,
            fontWeight: '900',
            color: WHITE,
            marginTop: 2,
            adjustsFontSizeToFit: true,
            ...(rank ? MILESTONE_SHADOW : NUMBER_SHADOW),
          }}
        />
        <TextWidget
          text={rank ? rank.toUpperCase() : 'day streak'}
          maxLines={1}
          style={
            rank
              ? {
                  fontSize: 13,
                  fontWeight: '900',
                  color: WHITE,
                  letterSpacing: 1,
                  marginTop: 2,
                }
              : { fontSize: 12, fontWeight: '600', color: WHITE_85 }
          }
        />
        {state === 'frozen' && (
          <TextWidget
            text={`Frozen · ${data.freezesLeft} left`}
            style={{ fontSize: 11, fontWeight: 'bold', color: WHITE_90, marginTop: 2 }}
          />
        )}
      </FlexWidget>
    </Shell>
  )
}

// Medium (home): streak column on the left, divider, rotating daily hook right.
function MediumWidget({
  state,
  data,
  now,
  clickData,
}: {
  state: StreakState
  data: NativeStreakData | null
  now: Date
  clickData?: Record<string, unknown>
}) {
  if (state === 'loggedOut' || !data) {
    return (
      <Shell gradient={GREY} craneSize={104} clickData={clickData}>
        <FlexWidget
          style={{
            height: 'match_parent',
            width: 'match_parent',
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <FlexWidget
            style={{ flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}
          >
            <TextWidget text="🔥" style={{ fontSize: 38 }} />
            <TextWidget
              text="Start a streak"
              maxLines={2}
              style={{ fontSize: 20, fontWeight: '900', color: WHITE, marginTop: 6 }}
            />
            <TextWidget
              text="Predict daily to keep it alive"
              maxLines={2}
              style={{ fontSize: 12, fontWeight: '600', color: WHITE_85, marginTop: 2 }}
            />
          </FlexWidget>
        </FlexWidget>
      </Shell>
    )
  }
  const tier = streakTier(data.streak)
  const flameSize = 34 + tier * 4
  const numberSize = 42 + tier * 4
  const rank = streakRank(data.streak)
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={104}
      clickData={clickData}
      frame={state === 'lit' && tier >= 1 ? FRAME_GOLD : undefined}
    >
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <FlexWidget
          style={{
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: 100,
          }}
        >
          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <TextWidget text={glyph(state)} style={{ fontSize: flameSize }} />
            {rank ? <MilestoneBadge /> : null}
          </FlexWidget>
          <TextWidget
            text={`${data.streak}`}
            maxLines={1}
            style={{
              fontSize: numberSize,
              fontWeight: '900',
              color: WHITE,
              marginTop: 2,
              adjustsFontSizeToFit: true,
              ...(rank ? MILESTONE_SHADOW : NUMBER_SHADOW),
            }}
          />
          <TextWidget
            text={rank ? rank.toUpperCase() : 'day streak'}
            maxLines={1}
            style={
              rank
                ? {
                    fontSize: 12,
                    fontWeight: '900',
                    color: WHITE,
                    letterSpacing: 1,
                    marginTop: 2,
                  }
                : { fontSize: 12, fontWeight: '600', color: WHITE_85 }
            }
          />
          {state === 'frozen' && (
            <TextWidget
              text={`Frozen · ${data.freezesLeft} left`}
              style={{ fontSize: 11, fontWeight: 'bold', color: WHITE_90, marginTop: 2 }}
            />
          )}
        </FlexWidget>

        <FlexWidget
          style={{
            width: 1,
            height: 'match_parent',
            backgroundColor: WHITE_22,
            marginHorizontal: 14,
          }}
        />

        <FlexWidget
          style={{
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          <TextWidget
            text={hookText(state, now)}
            maxLines={3}
            style={{ fontSize: 14, fontWeight: 'bold', color: WHITE }}
          />
        </FlexWidget>
      </FlexWidget>
    </Shell>
  )
}

// Compact (home, short/wide cell — e.g. a Pixel's 2x1): flame beside the number
// instead of stacked, so the content fits a short cell where the vertical layout
// would clip. Same data, horizontal arrangement.
function CompactWidget({
  state,
  data,
  clickData,
}: {
  state: StreakState
  data: NativeStreakData | null
  clickData?: Record<string, unknown>
}) {
  const rowStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 12,
  }
  if (state === 'loggedOut' || !data) {
    return (
      <Shell gradient={GREY} craneSize={70} clickData={clickData}>
        <FlexWidget style={rowStyle}>
          <TextWidget text="🔥" style={{ fontSize: 34 }} />
          <FlexWidget
            style={{ flexDirection: 'column', marginLeft: 10, flex: 1 }}
          >
            <TextWidget
              text="Start a streak"
              maxLines={1}
              style={{ fontSize: 15, fontWeight: '900', color: WHITE }}
            />
            <TextWidget
              text="Open Manifold"
              style={{ fontSize: 11, fontWeight: '600', color: WHITE_85 }}
            />
          </FlexWidget>
        </FlexWidget>
      </Shell>
    )
  }
  const tier = streakTier(data.streak)
  const rank = streakRank(data.streak)
  const label =
    state === 'frozen'
      ? `Frozen · ${data.freezesLeft} left`
      : rank
      ? rank.toUpperCase()
      : 'day streak'
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={70}
      clickData={clickData}
      frame={state === 'lit' && tier >= 1 ? FRAME_GOLD : undefined}
    >
      <FlexWidget style={rowStyle}>
        <TextWidget text={glyph(state)} style={{ fontSize: 40 }} />
        <FlexWidget
          style={{
            flexDirection: 'column',
            marginLeft: 10,
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextWidget
              text={`${data.streak}`}
              maxLines={1}
              style={{
                fontSize: 42,
                fontWeight: '900',
                color: WHITE,
                adjustsFontSizeToFit: true,
                ...(rank ? MILESTONE_SHADOW : NUMBER_SHADOW),
              }}
            />
            {rank ? (
              <TextWidget text="🏆" style={{ fontSize: 17, marginLeft: 6 }} />
            ) : null}
          </FlexWidget>
          <TextWidget
            text={label}
            maxLines={1}
            style={
              rank && state !== 'frozen'
                ? { fontSize: 11, fontWeight: '900', color: WHITE, letterSpacing: 1 }
                : { fontSize: 11, fontWeight: '600', color: WHITE_85 }
            }
          />
        </FlexWidget>
      </FlexWidget>
    </Shell>
  )
}

// MARK: - Entry point

// TEMP preview overrides (dev only — leave null in committed code).
const FORCE_STATE: StreakState | null = null
const FORCE_STREAK: number | null = null

// Single resizable widget: pick small vs medium by the host width (dp). Mirrors
// the iOS systemSmall / systemMedium families of one widget.
export function StreakWidget({
  widgetInfo,
  data,
  now,
}: {
  widgetInfo: WidgetInfo
  data: NativeStreakData | null
  now: Date
}) {
  const previewData: NativeStreakData | null =
    FORCE_STREAK != null
      ? {
          loggedIn: true,
          streak: FORCE_STREAK,
          lastBetTime: now.getTime(),
          lastStreakFreezeTime: 0,
          freezesLeft: 2,
          updatedAt: now.getTime(),
        }
      : data
  const state = FORCE_STATE ?? computeState(previewData, now)
  // Live midnight countdown only while the streak is still unguarded today.
  const showCountdown = state === 'pending'
  const clickData = {
    showCountdown,
    countdownMs: showCountdown ? msUntilPacificReset(now) : 0,
  }
  // Pick layout by cell shape: wide -> medium (hook), short/wide -> compact
  // (flame beside number, e.g. a Pixel 2x1), else the tall/square vertical small.
  const isMedium = widgetInfo.width >= 220
  const isShort = !isMedium && widgetInfo.height < 130
  return isMedium ? (
    <MediumWidget state={state} data={previewData} now={now} clickData={clickData} />
  ) : isShort ? (
    <CompactWidget state={state} data={previewData} clickData={clickData} />
  ) : (
    <SmallWidget state={state} data={previewData} clickData={clickData} />
  )
}

// Render helper called from the data layer (writeStreakWidget) and the headless
// task handler. Stamps `now` once so state + hook are consistent within a render.
export function renderStreakWidget(
  widgetInfo: WidgetInfo,
  data: NativeStreakData | null
) {
  return <StreakWidget widgetInfo={widgetInfo} data={data} now={new Date()} />
}

export const STREAK_WIDGET_NAME = 'Streak'

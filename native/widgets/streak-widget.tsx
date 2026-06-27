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

function gradientFor(state: StreakState): Gradient {
  switch (state) {
    case 'lit':
      return FLAME
    case 'frozen':
      return ICE
    default:
      return GREY // pending + loggedOut
  }
}

const WHITE = '#FFFFFF'
const WHITE_85 = 'rgba(255, 255, 255, 0.85)'
const WHITE_90 = 'rgba(255, 255, 255, 0.9)'
const WHITE_22 = 'rgba(255, 255, 255, 0.22)'
const RADIUS = 20

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
  children,
}: {
  gradient: Gradient
  craneSize: number
  children: any
}) {
  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundGradient: gradient,
        borderRadius: RADIUS,
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
}

// Small (home): vertical, left-aligned — glyph, big number, "day streak",
// optional frozen line, over a faint crane. Logged-out shows the invite.
function SmallWidget({
  state,
  data,
}: {
  state: StreakState
  data: NativeStreakData | null
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
      <Shell gradient={GREY} craneSize={84}>
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
  return (
    <Shell gradient={gradientFor(state)} craneSize={84}>
      <FlexWidget style={contentStyle}>
        <TextWidget text={glyph(state)} style={{ fontSize: 42 }} />
        <TextWidget
          text={`${data.streak}`}
          style={{ fontSize: 46, fontWeight: '900', color: WHITE, marginTop: 4 }}
        />
        <TextWidget
          text="day streak"
          style={{ fontSize: 12, fontWeight: '600', color: WHITE_85 }}
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
}: {
  state: StreakState
  data: NativeStreakData | null
  now: Date
}) {
  if (state === 'loggedOut' || !data) {
    return (
      <Shell gradient={GREY} craneSize={104}>
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
  return (
    <Shell gradient={gradientFor(state)} craneSize={104}>
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
            width: 96,
          }}
        >
          <TextWidget text={glyph(state)} style={{ fontSize: 36 }} />
          <TextWidget
            text={`${data.streak}`}
            style={{ fontSize: 42, fontWeight: '900', color: WHITE, marginTop: 2 }}
          />
          <TextWidget
            text="day streak"
            style={{ fontSize: 12, fontWeight: '600', color: WHITE_85 }}
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

// MARK: - Entry point

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
  const state = computeState(data, now)
  const isMedium = widgetInfo.width >= 200
  return isMedium ? (
    <MediumWidget state={state} data={data} now={now} />
  ) : (
    <SmallWidget state={state} data={data} />
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

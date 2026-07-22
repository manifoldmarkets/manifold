import React from 'react'
import {
  FlexWidget,
  ImageWidget,
  OverlapWidget,
  SvgWidget,
  TextWidget,
} from 'react-native-android-widget'
import type { WidgetInfo } from 'react-native-android-widget'
import type { NativeQuestData, NativeStreakData } from 'common/native-message'
import { CRANE_DATA_URI } from './crane-data'
import {
  MANI_ASPECT,
  ManiPose,
  ManiSeason,
  maniSeason,
  maniSvg,
  pickManiPose,
} from './mani-svg'

// Android home-screen streak widget. This is the platform-mirror of the iOS
// SwiftUI widget (native/targets/widget/index.swift): same state machine, same
// gradient palette, same copy. Android has no lock-screen widgets, so this is
// home small + medium only. These components MUST be pure functions returning
// react-native-android-widget primitives — no hooks, no state. They render from
// the snapshot passed in; the snapshot is recomputed into lit/pending/frozen
// here, so the widget stays correct hours after the last write.

// MARK: - State

type StreakState = 'lit' | 'pending' | 'frozen' | 'loggedOut'

// How many ms past LA-midnight the LA wall clock reads at `at`.
function laWallClockMsPastMidnight(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  // '24' can appear for midnight in some engines; normalize to 0.
  const h = get('hour') % 24
  const m = get('minute')
  const s = get('second')
  return ((h * 60 + m) * 60 + s) * 1000 + at.getMilliseconds()
}

// Most recent midnight America/Los_Angeles, in epoch ms (the streak "today"
// boundary the backend uses). First pass: subtract however many ms `now` is
// past LA-midnight in wall-clock terms. On the two DST-transition days
// wall-clock ms ≠ elapsed ms, so that candidate lands ±1h off — the second
// pass reads the LA wall clock AT the candidate and nudges it home (exactly 0,
// a no-op, on the other 363 days). Mirrors pacificStartOfDay() in index.swift,
// which gets DST handling from Calendar for free.
export function pacificStartOfDayMs(now: Date): number {
  let start = now.getTime() - laWallClockMsPastMidnight(now)
  const drift = laWallClockMsPastMidnight(new Date(start))
  if (drift !== 0) {
    const halfDay = 12 * 60 * 60 * 1000
    start += drift > halfDay ? 24 * 60 * 60 * 1000 - drift : -drift
  }
  return start
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

// The backend's midnight-PT cron (backend reset-betting-streaks) deterministically
// consumes one freeze for anyone who has a streak, has a freeze left, and didn't
// bet the day that just ended — setting lastStreakFreezeTime and decrementing
// streakForgiveness. A widget that hasn't re-synced since that rollover would
// otherwise keep showing a stale "pending", so we replay that single step locally
// and return an adjusted snapshot (state derives to frozen, freeze count -1).
//
// Only the streak-PRESERVING outcome is predicted (has a freeze -> frozen). The
// streak-LOST case (out of freezes) is deliberately left to a real sync — falsely
// telling someone their streak died is the costliest thing to get wrong. Guarded
// to a single missed day (snapshot was synced during the day that just ended) so
// it never compounds across multiple nights of a long-stale snapshot; anything
// staler falls through to the real data + the headless fetch. Mirrors
// predictOvernight() in index.swift.
export function predictOvernight(
  d: NativeStreakData | null,
  now: Date
): NativeStreakData | null {
  if (!d || !d.loggedIn || d.streak <= 0 || d.freezesLeft <= 0) return d
  try {
    const todayStart = pacificStartOfDayMs(now)
    const yesterdayStart = pacificStartOfDayMs(new Date(todayStart - 1))
    const syncedYesterday =
      d.updatedAt >= yesterdayStart && d.updatedAt < todayStart
    const missedYesterday = d.lastBetTime < yesterdayStart
    if (syncedYesterday && missedYesterday) {
      return {
        ...d,
        freezesLeft: d.freezesLeft - 1,
        lastStreakFreezeTime: todayStart, // -> computeState returns 'frozen'
        // updatedAt intentionally unchanged: this is a prediction, not a real
        // sync, so the headless fetch gate still knows to confirm/correct it.
      }
    }
  } catch {
    // Predictions never break a render — fall back to the raw snapshot.
  }
  return d
}

// Milliseconds from now until the next midnight America/Los_Angeles (the streak
// reset). Drives the live countdown Chronometer in the pending state. The next
// midnight is found as the start-of-day ~26h ahead, so it's exact even when
// today is 23/25h long (DST). Returns 0 when LA time can't be computed —
// callers treat 0 as "don't show a countdown" (a Chronometer started at zero
// would tick negative until the next re-render).
function msUntilPacificReset(now: Date): number {
  try {
    const startMs = pacificStartOfDayMs(now)
    const nextMidnight = pacificStartOfDayMs(
      new Date(startMs + 26 * 60 * 60 * 1000)
    )
    return Math.max(0, nextMidnight - now.getTime())
  } catch {
    return 0
  }
}

// MARK: - Quests
//
// The medium widget shows the secondary daily/weekly quests ("Share a market",
// "Create a market") as a checklist. The snapshot records each quest's `done` as
// of `updatedAt`; the widget keeps that valid only until the quest's period rolls
// over (daily → next midnight PT, weekly → next Monday midnight PT), then assumes
// "not done" — the safe state. Mirrors questItems() in index.swift.

type WidgetQuest = { title: string; rewardMana: number; done: boolean }
type TierBadge = NonNullable<NativeQuestData['tier']>

// Metallic capsule gradients for the supporter badge ("PRO ×2") above the
// quest rewards — silver for Plus, indigo for Pro, gold for Premium. Two-stop
// diagonal (the lib's gradients are 2-stop) reads as a sheen.
const TIER_BADGE_STYLE: Record<
  TierBadge['color'],
  { gradient: Gradient; fg: `#${string}` }
> = {
  silver: {
    gradient: { from: '#E9E9F0', to: '#9CA0A8', orientation: 'TL_BR' },
    fg: '#33333A',
  },
  indigo: {
    gradient: { from: '#818CF8', to: '#4338CA', orientation: 'TL_BR' },
    fg: '#FFFFFF',
  },
  amber: {
    gradient: { from: '#FFD98A', to: '#C97D06', orientation: 'TL_BR' },
    fg: '#4A2E00',
  },
}

function TierBadgeWidget({ tier }: { tier: TierBadge }) {
  const style = TIER_BADGE_STYLE[tier.color] ?? TIER_BADGE_STYLE.indigo
  const mult =
    tier.multiplier % 1 === 0
      ? String(tier.multiplier)
      : tier.multiplier.toFixed(1)
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 4,
      }}
    >
      <FlexWidget
        style={{
          backgroundGradient: style.gradient,
          borderRadius: 9,
          paddingHorizontal: 7,
          paddingVertical: 2,
        }}
      >
        <TextWidget
          text={`${tier.label} ×${mult}`}
          style={{ fontSize: 10, fontWeight: '900', color: style.fg }}
        />
      </FlexWidget>
    </FlexWidget>
  )
}

// Weekday in LA, 0=Sun … 6=Sat.
function pacificWeekday(now: Date): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
  }).format(now)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  return map[s] ?? 0
}

// Next Monday 00:00 Pacific strictly after `at` (the weekly-quest reset).
function nextPacificWeekResetMs(at: Date): number {
  const startToday = pacificStartOfDayMs(at)
  const wd = pacificWeekday(at)
  let days = (1 - wd + 7) % 7 // 0 if today is Monday
  if (days === 0) days = 7 // this Monday's midnight already passed → next one
  return startToday + days * 24 * 60 * 60 * 1000
}

// Apply the period-reset to a stored quest snapshot, returning the rows to render.
function effectiveQuests(
  data: NativeQuestData | null,
  now: Date
): WidgetQuest[] {
  if (!data || !data.quests?.length) return []
  try {
    const nowMs = now.getTime()
    const dayEnd = pacificStartOfDayMs(new Date(data.updatedAt)) + 24 * 60 * 60 * 1000
    const weekEnd = nextPacificWeekResetMs(new Date(data.updatedAt))
    // Defensive: skip any malformed row so the headless render never passes
    // undefined across the bridge to a native TextWidget (text is typed
    // string). Well-formed setQuests payloads pass through unchanged.
    return data.quests
      .filter(
        (q) => typeof q?.title === 'string' && Number.isFinite(q?.rewardMana)
      )
      .map((q) => {
        const periodEnd = q.period === 'weekly' ? weekEnd : dayEnd
        return {
          title: q.title,
          rewardMana: q.rewardMana,
          done: !!q.done && nowMs < periodEnd,
        }
      })
  } catch {
    // Never throw from a render: fall back to the streak-only medium.
    return []
  }
}

// Short rotating caption for the LIT small widget — fills the corner the
// countdown Chronometer occupies while pending, so the done-state never feels
// bare. Mirrors litCaption() in index.swift.
function litCaption(now: Date, streak: number): string {
  const lines = [
    'See you tomorrow',
    'Streak secured',
    'Another one 📈',
    'Nice.',
    `Day ${streak} ✓`,
    'Buy low, sell high',
    'Be less wrong',
    'Compounding 📈',
  ]
  return lines[(pacificDayOfYear(now) + streak) % lines.length]
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
  if (state === 'lit') return 'See you tomorrow'
  if (state === 'frozen') return 'Saved by a freeze 🧊'
  const day = pacificDayOfYear(now)
  const pct = 55 + ((day * 7) % 40) // 55–94, deterministic by day
  // Keep these short — the medium's hook column is narrow, so anything much longer
  // than ~30 chars truncates mid-word (e.g. "…don't push").
  const hooks = [
    `Predict today? ${pct}% 📈`,
    `P(you predict): ${pct}%`,
    'Resolves YES if you bet today',
    'Your streak: trading at 96%',
    `Survives the week? ${pct}%`,
    `You'll bet today: ${pct}% ▲`,
    'We miss you!',
    'Your streak is lonely',
    "Don't break the chain",
    'Keep the flame alive 🔥',
    'We saved your spot',
    'The future awaits',
    'Predict the future',
    'Be less wrong',
    'What do you know?',
    'Mana where your mouth is',
    "Someone's wrong online 👀",
    "Try sorting by 'new' 👀",
    'Buy low, sell high',
    'Fresh markets just listed',
    'Early bird gets the mana',
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

// A "gold milestone" = a lit streak of 30+. It turns on the coherent gold cues at
// once — the gold gradient (see gradientFor: gold at 30, richer gold at 100), a
// trophy badge, and (only where there's vertical room) a gold frame — so a
// milestone reads as one premium "level up". Crucially we do NOT scale the number
// up at a milestone: the short 2x2 / medium cells (≈133dp tall) can't fit a bigger
// hero without clipping the label, and the gold treatment already says "special".
function isGoldMilestone(state: StreakState, streak: number): boolean {
  return state === 'lit' && streak >= 30
}

// The line under the streak count. "day streak" is GONE (design review: the
// flame + number already say it) — the freeze inventory lives here instead:
// remaining count while frozen, owned count otherwise. Rendered by <FreezeLine>.
// Mirrors freezeLine() in index.swift.
function freezeLine(state: StreakState, freezesLeft: number): string {
  if (state === 'frozen') return `Frozen · ${freezesLeft} left`
  return `🧊 ×${freezesLeft}`
}

// Solid alert red for the out-of-freezes warning pill. A flat red *text* was
// unreadable on the lit orange gradient (and invisible as a signal on frozen
// blue); a filled pill controls its own contrast, so white text on it stays
// legible and stands out on grey, orange, AND blue.
const FREEZE_ZERO_BG = '#FF4D4D'

// The freeze inventory line. At zero freezes it becomes a red warning pill
// (white text) so "you're out" reads clearly on any state background; above zero
// it's the plain muted line. `reserved` renders it fully transparent to hold the
// native Chronometer's slot open (quest panel only). Mirrors freezeLineView() in
// index.swift.
function FreezeLine({
  state,
  freezesLeft,
  fontSize,
  marginTop = 0,
  reserved = false,
}: {
  state: StreakState
  freezesLeft: number
  fontSize: number
  marginTop?: number
  reserved?: boolean
}) {
  const text = freezeLine(state, freezesLeft)
  if (reserved) {
    return (
      <TextWidget
        text={text}
        maxLines={1}
        style={{
          fontSize,
          fontWeight: '600',
          color: 'rgba(255, 255, 255, 0)',
          marginTop,
        }}
      />
    )
  }
  if (freezesLeft <= 0) {
    return (
      <FlexWidget
        style={{
          flexDirection: 'row',
          backgroundColor: FREEZE_ZERO_BG,
          // Light outline so the red pill separates from the warm lit-orange
          // gradient too (it already pops on grey/blue).
          borderWidth: 1.5,
          borderColor: 'rgba(255, 255, 255, 0.92)',
          borderRadius: 9,
          paddingHorizontal: 7,
          paddingVertical: 2,
          marginTop,
        }}
      >
        <TextWidget
          text={text}
          maxLines={1}
          style={{ fontSize, fontWeight: '700', color: WHITE }}
        />
      </FlexWidget>
    )
  }
  return (
    <TextWidget
      text={text}
      maxLines={1}
      style={{ fontSize, fontWeight: '600', color: WHITE_85, marginTop }}
    />
  )
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
const WHITE_22 = 'rgba(255, 255, 255, 0.22)'
const WHITE_55 = 'rgba(255, 255, 255, 0.55)'
const WHITE_45 = 'rgba(255, 255, 255, 0.45)'
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

// Unlit (grey) flame for the pending state. They haven't bet today, so the flame
// shouldn't look lit — iOS desaturates the 🔥 with grayscale(), but TextWidget
// has no opacity/grayscale, so we draw the flame as an inline SVG we can colour.
// (Material "whatshot" path.)
const UNLIT_FLAME_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path fill="#9CA0A8" d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 ' +
  '0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 ' +
  '8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 ' +
  '2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>'

// Dark halo behind the lit/frozen emoji so it reads against the warm gradient
// (an orange 🔥 on the orange "lit" background otherwise washes out).
const GLYPH_SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.5)' as const,
  textShadowRadius: 6,
  textShadowOffset: { width: 0, height: 1 },
}

// The streak glyph. Lit = 🔥, frozen = 🧊, pending/loggedOut = a grey (unlit)
// flame — a logged-out / no-streak user has no lit flame to show.
function GlyphWidget({ state, size }: { state: StreakState; size: number }) {
  if (state === 'pending' || state === 'loggedOut') {
    return <SvgWidget svg={UNLIT_FLAME_SVG} style={{ width: size, height: size }} />
  }
  return (
    <TextWidget
      text={state === 'frozen' ? '🧊' : '🔥'}
      style={{ fontSize: size, ...GLYPH_SHADOW }}
    />
  )
}

// MARK: - Layouts

// Shared shell: gradient background + bottom-right brand element + tap-to-open.
// The brand element is either the faint crane watermark or (small widgets)
// Mani the mascot — an SVG whose mood tracks the streak state (see mani-svg.ts;
// mirrors ManiView on iOS). Content stacks on top via OverlapWidget
// (gradient → crane/mascot → content).
function Shell({
  gradient,
  craneSize,
  mascot,
  clickData,
  frame,
  children,
}: {
  gradient: Gradient
  craneSize: number
  // When set, replaces the crane watermark: { svg, width, height }.
  mascot?: { svg: string; width: number; height: number }
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
        {mascot ? (
          // marginRight clears the widget's rounded corner: launchers don't
          // clip children to the corner radius, so ink there would float
          // outside the visible widget. The neck bleeds off the FLAT bottom
          // edge instead.
          <SvgWidget
            svg={mascot.svg}
            style={{
              width: mascot.width,
              height: mascot.height,
              marginRight: 22,
            }}
          />
        ) : (
          <ImageWidget
            image={CRANE_DATA_URI}
            imageWidth={craneSize}
            imageHeight={craneSize}
            style={{ marginRight: 2, marginBottom: 4 }}
          />
        )}
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

// Milestone badge — a sparkle + a big trophy, shown on a gold milestone (a lit
// streak of 30+). Bigger + flashier on the small widget where there's room
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

// Small (home): vertical, left-aligned — glyph, big number, "day streak" (or the
// freeze count when frozen), over a faint crane. Logged-out shows the invite.
//
// `isTall` (a 2x3-ish cell) anchors the hero to the TOP and fills the lower half
// so the content doesn't float, marooned, in the middle of a tall gradient field.
// What fills the bottom depends on state: pending already gets the native
// countdown Chronometer overlaid bottom-left (see the patch), so we add a hook
// line at the bottom only for the other states — never both, or they'd collide.
function SmallWidget({
  state,
  data,
  now,
  cellWidth,
  allQuestsDone,
  isTall,
  clickData,
}: {
  state: StreakState
  data: NativeStreakData | null
  now: Date
  cellWidth: number // granted cell width in dp (widgetInfo.width)
  allQuestsDone?: boolean
  isTall?: boolean
  clickData?: Record<string, unknown>
}) {
  // Content pins to the TOP in every state: Mani owns the bottom-right corner
  // and the native countdown Chronometer the bottom-left (when shown), so the
  // hero never collides with either. Mirrors the iOS small layout.
  const contentStyle = {
    height: 'match_parent' as const,
    width: 'match_parent' as const,
    flexDirection: 'column' as const,
    // Hero pins top; the lit caption (when present) drops to the bottom-left,
    // clear of Mani's corner. Pending/frozen leave the bottom to the native
    // Chronometer, so there's only ever one child and it stays top.
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    padding: isTall ? 14 : 8,
  }
  // Mani the mascot (see mani-svg.ts): mood from state + time-to-reset, pose
  // rotated daily. Replaces the crane watermark AND the old tall-cell bottom
  // caption — Mani fills that space now. Sized relative to the granted cell so
  // it holds its presence across launcher grids; the SVG viewport is cropped
  // so the neck runs off the widget's bottom-right edge (see MANI_ASPECT).
  const maniW = Math.round(cellWidth * (isTall ? 0.56 : 0.5))
  const mascot = {
    svg: maniSvg(
      pickManiPose(
        state,
        msUntilPacificReset(now),
        data?.streak ?? 0,
        pacificDayOfYear(now),
        data && data.lastBetTime > 0
          ? new Date(data.lastBetTime).getHours()
          : null,
        allQuestsDone
      ),
      maniSeason(now)
    ),
    width: maniW,
    height: Math.round(maniW * MANI_ASPECT),
  }
  if (state === 'loggedOut' || !data) {
    return (
      <Shell
        gradient={GREY}
        craneSize={84}
        mascot={mascot}
        clickData={clickData}
      >
        <FlexWidget style={contentStyle}>
          <FlexWidget
            style={{ flexDirection: 'column', alignItems: 'flex-start' }}
          >
            <GlyphWidget state="loggedOut" size={42} />
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
        </FlexWidget>
      </Shell>
    )
  }
  const milestone = isGoldMilestone(state, data.streak)
  // Fixed sizes (no milestone scaling): tall cells have room to go big; the short
  // square (down to ~130dp — below that it routes to CompactWidget) must stay
  // conservative so glyph + number + label all fit with margin and never clip.
  const flameSize = isTall ? 32 : 24
  const numberSize = isTall ? 54 : 42
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={84}
      mascot={mascot}
      clickData={clickData}
      // NOTE: frame wraps the shell in an outer FlexWidget, which becomes the
      // ROOT — and the patched Chronometer reads {showCountdown} from the
      // root's clickActionData. Safe today only because frame ⇒ lit milestone
      // and countdown ⇒ pending/frozen never coincide; a framed countdown
      // state would silently lose its timer.
      frame={isTall && milestone ? FRAME_GOLD : undefined}
    >
      <FlexWidget style={contentStyle}>
        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          {/* Flame to the LEFT of the number on every small size (square + tall)
              so the streak line reads the same across the whole widget family.
              NO plain 🏆 on the square (iOS parity: it over-crowded the row at
              3+ digits; the gold gradient + Mani's starstruck/party poses carry
              the milestone). The tall keeps its ✨🏆 badge — it has the room. */}
          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <GlyphWidget state={state} size={flameSize} />
            <TextWidget
              text={`${data.streak}`}
              maxLines={1}
              style={{
                fontSize: numberSize,
                fontWeight: '900',
                color: WHITE,
                marginLeft: isTall ? 8 : 6,
                adjustsFontSizeToFit: true,
                ...(milestone ? MILESTONE_SHADOW : NUMBER_SHADOW),
              }}
            />
            {milestone && isTall ? <FlexWidget style={{ flex: 1 }} /> : null}
            {milestone && isTall ? <MilestoneBadge big /> : null}
          </FlexWidget>
          <FreezeLine
            state={state}
            freezesLeft={data.freezesLeft}
            fontSize={isTall ? 14 : 12}
            marginTop={isTall ? 2 : 1}
          />
        </FlexWidget>
        {state === 'lit' ? (
          <TextWidget
            text={litCaption(now, data.streak)}
            maxLines={1}
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          />
        ) : null}
      </FlexWidget>
    </Shell>
  )
}

// One quest checklist row (medium widget): checkbox + title + mana reward. Done
// quests dim + check; pending ones stay bright. Full cell width, so the title and
// reward both fit without truncating (unlike a narrow right column).
// `large` scales the row up on tall medium cells (e.g. Pixel's tall grid) so the
// checklist fills the box instead of floating; short cells keep the compact size.
function QuestRow({ quest, large }: { quest: WidgetQuest; large?: boolean }) {
  const { done } = quest
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: large ? 10 : 5,
      }}
    >
      <TextWidget text={done ? '✅' : '⬜'} style={{ fontSize: large ? 18 : 14 }} />
      <TextWidget
        text={quest.title}
        maxLines={1}
        style={{
          fontSize: large ? 16 : 13,
          fontWeight: '600',
          color: done ? WHITE_55 : WHITE,
          marginLeft: large ? 10 : 8,
        }}
      />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget
        text={`+M${quest.rewardMana}`}
        style={{
          fontSize: large ? 14 : 12,
          fontWeight: 'bold',
          color: done ? WHITE_45 : WHITE_85,
        }}
      />
    </FlexWidget>
  )
}

// Medium (home): when quests are synced, a compact streak header over a daily/
// weekly quest checklist (the wide-but-short Android medium fits full-width rows
// far better than iOS's left/right split). Without quests it falls back to the
// streak column + rotating hook.
function MediumWidget({
  state,
  data,
  now,
  quests,
  tier,
  showCountdown,
  isTallMedium,
  clickData,
}: {
  state: StreakState
  data: NativeStreakData | null
  now: Date
  quests: WidgetQuest[]
  tier?: TierBadge
  showCountdown?: boolean
  isTallMedium?: boolean
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
            <GlyphWidget state="loggedOut" size={38} />
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
  const milestone = isGoldMilestone(state, data.streak)
  // Quest panel (Layout B): full-width quest checklist on TOP, streak on the
  // BOTTOM-LEFT. In pending/frozen the live countdown Chronometer overlays the
  // bottom-left corner — the (possibly empty) freeze line under the streak
  // number renders transparent then, reserving exactly the spot the native
  // ticker lands on (see the transparent-line trick below).
  if (quests.length > 0) {
    return (
      <Shell
        gradient={gradientFor(state, data.streak)}
        craneSize={104}
        clickData={clickData}
      >
        <FlexWidget
          style={{
            height: 'match_parent',
            width: 'match_parent',
            flexDirection: 'column',
            // Only tall grid cells (e.g. Pixel's tall rows) have slack: there
            // space-between dumps it all into the middle as a void, so center the
            // group to keep it compact. Short cells (small phones) have no slack —
            // centering + a gap would overflow and clip "day streak", so keep
            // space-between. In pending/frozen the streak must stay bottom (native
            // Chronometer is hard-anchored bottom-left), so never center there.
            justifyContent:
              isTallMedium && !showCountdown ? 'center' : 'space-between',
            padding: 12,
          }}
        >
          <FlexWidget
            style={{ width: 'match_parent', flexDirection: 'column' }}
          >
            {tier ? <TierBadgeWidget tier={tier} /> : null}
            {quests.map((q, i) => (
              <QuestRow key={i} quest={q} large={isTallMedium} />
            ))}
          </FlexWidget>
          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'column',
              alignItems: 'flex-start',
              // Breathing room from the quest list when centered on a tall cell
              // (no effect under space-between, where the blocks are already apart).
              marginTop: isTallMedium && !showCountdown ? 16 : 0,
            }}
          >
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
              <GlyphWidget state={state} size={isTallMedium ? 26 : 20} />
              <TextWidget
                text={`${data.streak}`}
                maxLines={1}
                style={{
                  fontSize: isTallMedium ? 34 : 26,
                  fontWeight: '900',
                  color: WHITE,
                  marginLeft: 6,
                }}
              />
              {milestone ? (
                <TextWidget
                  text="🏆"
                  style={{ fontSize: isTallMedium ? 20 : 16, marginLeft: 4 }}
                />
              ) : null}
            </FlexWidget>
            {/* The freeze line sits under the number — in the exact spot the
                live timer occupies (they never show together), so it renders
                transparent while the timer ticks to reserve the position. */}
            <FreezeLine
              state={state}
              freezesLeft={data.freezesLeft}
              fontSize={isTallMedium ? 14 : 12}
              marginTop={1}
              reserved={showCountdown}
            />
          </FlexWidget>
        </FlexWidget>
      </Shell>
    )
  }
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={104}
      clickData={clickData}
    >
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
          padding: 10,
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
          <FlexWidget
            style={{
              width: 'match_parent',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <GlyphWidget state={state} size={24} />
            {milestone ? <MilestoneBadge /> : null}
          </FlexWidget>
          <TextWidget
            text={`${data.streak}`}
            maxLines={1}
            style={{
              fontSize: 42,
              fontWeight: '900',
              color: WHITE,
              marginTop: 2,
              adjustsFontSizeToFit: true,
              ...(milestone ? MILESTONE_SHADOW : NUMBER_SHADOW),
            }}
          />
          <FreezeLine
            state={state}
            freezesLeft={data.freezesLeft}
            fontSize={12}
            marginTop={1}
          />
        </FlexWidget>

        <FlexWidget
          style={{
            width: 1,
            height: 'match_parent',
            backgroundColor: WHITE_22,
            marginHorizontal: 10,
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
          <GlyphWidget state="loggedOut" size={34} />
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
  const milestone = isGoldMilestone(state, data.streak)
  return (
    <Shell
      gradient={gradientFor(state, data.streak)}
      craneSize={70}
      clickData={clickData}
    >
      <FlexWidget style={rowStyle}>
        <GlyphWidget state={state} size={40} />
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
                ...(milestone ? MILESTONE_SHADOW : NUMBER_SHADOW),
              }}
            />
            {milestone ? (
              <TextWidget text="🏆" style={{ fontSize: 17, marginLeft: 6 }} />
            ) : null}
          </FlexWidget>
          <FreezeLine state={state} freezesLeft={data.freezesLeft} fontSize={11} />
        </FlexWidget>
      </FlexWidget>
    </Shell>
  )
}

// MARK: - Entry point

// DEBUG: render a grid of every Mani pose ('poses') or one pose across all
// seasons ('seasons') instead of the real widget — an on-device androidsvg
// audit in one screenshot (Android's answer to iOS's kDebugParade; the OS
// gives us no timed carousel, so we tile instead). Must be null in commits.
const DEBUG_MANI_MATRIX: 'poses' | 'seasons' | null = null

const ALL_MANI_POSES: ManiPose[] = [
  'happyClassic', 'smug', 'starstruck', 'party', 'fireEye',
  'heartEye', 'blushing', 'chirping',
  'earlyBird', 'nightOwl', 'ecstatic',
  'watching', 'sideEye', 'quizzical',
  'sweating', 'alarmed',
  'madClassic', 'fuming', 'disappointed',
  'icy', 'shivering', 'asleep',
]

function ManiMatrixWidget({ mode }: { mode: 'poses' | 'seasons' }) {
  const svgs =
    mode === 'poses'
      ? ALL_MANI_POSES.map((p) => maniSvg(p))
      : (['none', 'halloween', 'christmas', 'newYear'] as ManiSeason[]).map(
          (s) => maniSvg('watching', s)
        )
  const perRow = mode === 'poses' ? 5 : 2
  const size = mode === 'poses' ? 32 : 74
  const rows: string[][] = []
  for (let i = 0; i < svgs.length; i += perRow)
    rows.push(svgs.slice(i, i + perRow))
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#3A3F63',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {rows.map((row, i) => (
        <FlexWidget key={i} style={{ flexDirection: 'row' }}>
          {row.map((svg, j) => (
            <SvgWidget
              key={j}
              svg={svg}
              style={{
                width: size,
                height: Math.round(size * MANI_ASPECT),
                marginRight: 2,
              }}
            />
          ))}
        </FlexWidget>
      ))}
    </FlexWidget>
  )
}

// TEMP preview overrides (dev only — leave null in committed code).
const FORCE_STATE: StreakState | null = null
const FORCE_STREAK: number | null = null
// Sample quests for previewing the quest panel on-device until the web `setQuests`
// sync ships. To preview, set this to a NativeQuestData literal (e.g. two quests);
// must be null in commits.
const FORCE_QUESTS: NativeQuestData | null = null
// Dev: override the remaining ms to preview the countdown urgency colours
// (e.g. 3 * 60 * 60 * 1000 = 3h → red). Null = use the real time to midnight.
const FORCE_COUNTDOWN_MS: number | null = null

// Single resizable widget: pick small vs medium by the host width (dp). Mirrors
// the iOS systemSmall / systemMedium families of one widget.
export function StreakWidget({
  widgetInfo,
  data,
  questData,
  now,
}: {
  widgetInfo: WidgetInfo
  data: NativeStreakData | null
  questData: NativeQuestData | null
  now: Date
}) {
  if (DEBUG_MANI_MATRIX) return <ManiMatrixWidget mode={DEBUG_MANI_MATRIX} />

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
  // Replay the deterministic overnight freeze if we haven't re-synced since the
  // midnight rollover, so a frozen streak shows as frozen (not stale pending)
  // even with the app closed. No-op in the common (already-fresh) case.
  const effectiveData = predictOvernight(previewData, now)
  const state = FORCE_STATE ?? computeState(effectiveData, now)
  // Pick layout by cell shape: wide -> medium (hook), short/wide -> compact
  // (flame beside number, e.g. a Pixel 2x1), tall/narrow -> the top-anchored
  // small (hero up top, hook/countdown filling the bottom), else the square
  // vertical small (centered).
  const isMedium = widgetInfo.width >= 220
  const isShort = !isMedium && widgetInfo.height < 130
  const isTall = !isMedium && widgetInfo.height >= 200
  const isSquare = !isMedium && !isShort && !isTall
  const quests = effectiveQuests(FORCE_QUESTS ?? questData, now)
  const mediumHasQuests = isMedium && quests.length > 0
  // Live midnight countdown whenever they haven't bet today (pending OR frozen —
  // a freeze covered today but the day still isn't "done"). The native Chronometer
  // is hard-anchored bottom-left (see the patch), so it only fits where that
  // corner is clear: the tall + square (hero top-anchored), and the medium quest
  // panel (Layout B — the streak block's freeze line renders transparent there
  // to reserve the ticker's spot). The plain (no-quest) medium can't host it, so
  // it's left off there. Requires a computable reset time (countdownMs > 0):
  // starting the Chronometer at zero would tick negative until the next render.
  const countdownMs = FORCE_COUNTDOWN_MS ?? msUntilPacificReset(now)
  const showCountdown =
    (state === 'pending' || state === 'frozen') &&
    countdownMs > 0 &&
    (isTall || isSquare || mediumHasQuests)
  const clickData = {
    showCountdown,
    countdownMs: showCountdown ? countdownMs : 0,
  }
  return isMedium ? (
    <MediumWidget
      state={state}
      data={effectiveData}
      now={now}
      quests={quests}
      tier={(FORCE_QUESTS ?? questData)?.tier}
      showCountdown={showCountdown}
      // Tall enough to have vertical slack (content needs ~135dp). Below this the
      // cell is "short-wide" and the compact space-between layout fills it.
      isTallMedium={widgetInfo.height >= 170}
      clickData={clickData}
    />
  ) : isShort ? (
    <CompactWidget state={state} data={effectiveData} clickData={clickData} />
  ) : (
    <SmallWidget
      state={state}
      data={effectiveData}
      now={now}
      cellWidth={widgetInfo.width}
      allQuestsDone={quests.length > 0 && quests.every((q) => q.done)}
      isTall={isTall}
      clickData={clickData}
    />
  )
}

// Render helper called from the data layer (writeStreakWidget) and the headless
// task handler. Stamps `now` once so state + hook are consistent within a render.
export function renderStreakWidget(
  widgetInfo: WidgetInfo,
  data: NativeStreakData | null,
  questData: NativeQuestData | null = null
) {
  return (
    <StreakWidget
      widgetInfo={widgetInfo}
      data={data}
      questData={questData}
      now={new Date()}
    />
  )
}

export const STREAK_WIDGET_NAME = 'Streak'

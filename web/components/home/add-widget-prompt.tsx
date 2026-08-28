import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from '@heroicons/react/solid'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useNativeInfo } from 'web/components/native-message-provider'
import {
  isAtLeastVersion,
  MIN_WIDGET_APP_VERSION,
  nativePinStreakWidget,
} from 'web/lib/native/native-messages'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { track } from 'web/lib/service/analytics'

// The real widgets' lit gradient (FLAME in streak-widget.tsx / index.swift).
// The previews show a low streak, so flame — not the gold milestone palette.
const CARD =
  'relative overflow-hidden select-none rounded-2xl p-2.5 text-white shadow-md ' +
  'bg-gradient-to-br from-[#FF8A3D] to-[#C7331A]'

// Mani's viewBox on the real widgets. The body geometry deliberately runs past
// the bottom (to y=140) so the neck bleeds off the edge instead of ending in
// mid-air; the SVG viewport crops it. Keep the element's aspect EXACTLY this or
// the mascot letterboxes and floats away from the corner.
const MANI_W = 110
const MANI_H = 118

// Mani, the widget mascot: faceted crane head peeking up from the bottom-right,
// neck running off the bottom edge (matches ManiView / mani-svg.ts, PURPLE
// palette). Sized by width; height follows the real aspect.
function MiniMani({ width }: { width: number }) {
  return (
    <svg
      viewBox={`0 0 ${MANI_W} ${MANI_H}`}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
      style={{ width, height: (width * MANI_H) / MANI_W }}
      className="pointer-events-none absolute bottom-0 right-2 drop-shadow"
    >
      <polygon points="100,140 114,140 104,68 94,70" fill="#4F3FD6" />
      <polygon points="78,140 100,140 94,70 80,74" fill="#6C5CE7" />
      <polygon points="50,36 92,30 102,66 66,74" fill="#8B7BF7" />
      <polygon points="66,74 102,66 94,70 80,74" fill="#5B4BE0" />
      <polygon points="54,48 64,70 8,62" fill="#3B2FB8" />
      <circle cx="78" cy="50" r="7" fill="#fff" />
      <circle cx="75" cy="51" r="3.2" fill="#1c1633" />
    </svg>
  )
}

// Quest checkbox for the iOS preview — mirrors questRow() in index.swift, which
// uses SF Symbols `circle` / `checkmark.circle.fill` at 14pt (white, dimmed to
// 0.65 while undone). Android's real widget uses ⬜/✅ emoji because TextWidget
// can't draw a vector inline, so PreviewTall keeps those on purpose.
function QuestCheck({ done }: { done?: boolean }) {
  if (done) return <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0">
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-[0.65]"
      />
    </svg>
  )
}

// 2x2: compact streak widget — streak top-left, Mani bottom-right.
function PreviewSmall() {
  return (
    <div className={CARD} style={{ width: 96, height: 96 }}>
      <MiniMani width={46} />
      <div className="relative">
        <Row className="items-center gap-1">
          <span className="text-2xl leading-none drop-shadow">🔥</span>
          <span className="text-2xl font-black leading-none">5</span>
        </Row>
        <div className="mt-1 text-[10px] font-semibold opacity-90">🧊 ×2</div>
      </div>
    </div>
  )
}

// iOS medium: streak column | divider | quest checklist, with Mani in the
// corner — mirrors the SwiftUI medium (Android stacks quests full-width).
function PreviewMediumIOS() {
  return (
    <div className={CARD} style={{ width: 208, height: 96 }}>
      <MiniMani width={40} />
      <Row className="relative h-full items-stretch gap-2">
        <Col className="justify-center">
          <Row className="items-center gap-1">
            <span className="text-2xl leading-none drop-shadow">🔥</span>
            <span className="text-2xl font-black leading-none">5</span>
          </Row>
          <div className="mt-1 text-[10px] font-semibold opacity-90">🧊 ×2</div>
        </Col>
        <div className="w-px shrink-0 bg-white/25" />
        <Col className="min-w-0 flex-1 justify-start gap-1 pt-1 text-[10px] font-semibold">
          {/* Done rows dim + strike through, like questRow() on the real widget. */}
          <Row className="items-center gap-1.5">
            <QuestCheck done />
            <span className="truncate line-through opacity-[0.55]">
              Share a market
            </span>
            <span className="ml-auto shrink-0 opacity-50">+M5</span>
          </Row>
          <Row className="items-center gap-1.5">
            <QuestCheck />
            <span className="truncate">Create a market</span>
            <span className="ml-auto shrink-0 opacity-[0.92]">+M100</span>
          </Row>
        </Col>
      </Row>
    </div>
  )
}

// 2x3: taller widget — quest checklist up top, streak below, Mani bottom-right.
// Keeps the ⬜/✅ emoji: that IS what the real Android widget draws (TextWidget
// can't render a vector icon inline), unlike the iOS medium above.
function PreviewTall() {
  return (
    <div className={CARD} style={{ width: 150 }}>
      <MiniMani width={52} />
      <div className="relative">
        <Row className="items-center justify-between text-[10px] font-semibold">
          <span>✅ Share a market</span>
          <span className="opacity-90">+M5</span>
        </Row>
        <Row className="mt-1 items-center justify-between text-[10px] font-semibold">
          <span>✅ Create a market</span>
          <span className="opacity-90">+M100</span>
        </Row>
        <Row className="mt-3 items-center gap-1.5">
          <span className="text-2xl leading-none drop-shadow">🔥</span>
          <span className="text-3xl font-black leading-none">5</span>
        </Row>
        <div className="text-[10px] font-semibold opacity-90">🧊 ×2</div>
      </div>
    </div>
  )
}

// Native only: the streak widget ships on both platforms. Android can one-tap
// pin via our native module; iOS has no API to programmatically pin a widget
// (Apple forbids it), so it gets manual long-press instructions instead. Never
// shown on web so we don't prompt someone who can't add it.
//
// Collapsed state is a clean one-liner; expanding reveals the previews. The
// collapsed choice persists (localStorage), so once a user folds it away it
// stays tidy on future visits.
export function AddWidgetPrompt() {
  const { isNative, platform, version } = useNativeInfo()
  const [collapsed, setCollapsed] = usePersistentLocalState(
    false,
    'streak-widget-prompt-collapsed'
  )
  if (!isNative || (platform !== 'android' && platform !== 'ios')) return null
  // The widget lives in the native binary, which ships days after this web
  // deploy. On an older iOS binary there's no widget target, so the long-press
  // instructions send people hunting for something that isn't in the gallery; on
  // an older Android binary `pinStreakWidget` falls through to App.tsx's else
  // branch and the button silently does nothing. `version` is '' until the
  // versionRequested handshake answers — fail closed and show nothing.
  if (!isAtLeastVersion(version, MIN_WIDGET_APP_VERSION)) return null
  const isIOS = platform === 'ios'

  const onAdd = () => {
    track('add streak widget clicked')
    nativePinStreakWidget()
  }

  return (
    <Col className="border-ink-200 bg-canvas-50 mt-2 gap-3 rounded-lg border p-3">
      <Row className="items-center justify-between gap-2">
        {isIOS ? (
          <Row className="text-ink-700 items-center gap-1.5 text-sm font-semibold">
            <PlusIcon className="h-4 w-4" />
            Add the streak widget
          </Row>
        ) : (
          <Button color="indigo" size="sm" onClick={onAdd} className="w-fit">
            <PlusIcon className="mr-1 h-4 w-4" />
            Add to home screen
          </Button>
        )}
        <button
          className="text-ink-500 hover:text-ink-700 -m-1 shrink-0 p-1"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Show widget preview' : 'Hide widget preview'}
        >
          {collapsed ? (
            <ChevronDownIcon className="h-5 w-5" />
          ) : (
            <ChevronUpIcon className="h-5 w-5" />
          )}
        </button>
      </Row>

      {!collapsed && (
        <>
          <Row className="items-start gap-3">
            <Col className="items-center gap-1">
              <PreviewSmall />
              <span className="text-ink-500 text-[10px] font-medium">
                {isIOS ? 'Small' : '2x2'}
              </span>
            </Col>
            <Col className="items-center gap-1">
              {isIOS ? <PreviewMediumIOS /> : <PreviewTall />}
              <span className="text-ink-500 text-[10px] font-medium">
                {isIOS ? 'Medium' : '2x3'}
              </span>
            </Col>
          </Row>
          <span className="text-ink-600 text-sm">
            {isIOS
              ? 'Long-press your home screen, tap + (or Edit → Add Widget), then search "SAGE".'
              : 'Add the SAGE streak widget so your streak and quests are one glance away.'}
          </span>
        </>
      )}
    </Col>
  )
}

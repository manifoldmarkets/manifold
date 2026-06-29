import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
} from '@heroicons/react/solid'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useNativeInfo } from 'web/components/native-message-provider'
import { nativePinStreakWidget } from 'web/lib/native/native-messages'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { track } from 'web/lib/service/analytics'

const CARD =
  'relative overflow-hidden select-none rounded-2xl bg-gradient-to-br ' +
  'from-orange-400 to-orange-600 p-2.5 text-white shadow-md'

// Faint Manifold crane in the bottom-right, matching the real widget's
// watermark (the native Shell draws the crane there at low opacity).
function CraneMark() {
  return (
    <img
      src="/logo-white.svg"
      alt=""
      aria-hidden
      className="pointer-events-none absolute bottom-1 right-1 h-14 w-14 opacity-25"
    />
  )
}

// 2x2: compact streak-only widget (flame + streak, like the small layout).
function PreviewSmall() {
  return (
    <div className={CARD} style={{ width: 96, height: 96 }}>
      <CraneMark />
      <div className="relative">
        <Row className="items-center gap-1">
          <span className="text-2xl leading-none drop-shadow">🔥</span>
          <span className="text-2xl font-black leading-none">5</span>
        </Row>
        <div className="mt-1 text-[10px] font-semibold opacity-90">
          day streak
        </div>
      </div>
    </div>
  )
}

// 2x3: taller widget that also shows the quest checklist above the streak.
function PreviewTall() {
  return (
    <div className={CARD} style={{ width: 150 }}>
      <CraneMark />
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
        <div className="text-[10px] font-semibold opacity-90">day streak</div>
      </div>
    </div>
  )
}

// Native Android only: the streak widget ships on Android (the iOS widget is
// still in progress) and Android can one-tap pin via our native module. Never
// shown on web or iOS so we don't prompt someone who can't add it. Enable iOS
// here once its widget ships (with manual long-press instructions).
//
// Collapsed state is a clean "Add to home screen" button; expanding reveals the
// previews. The collapsed choice persists (localStorage), so once a user folds
// it away it stays a tidy button on future visits.
export function AddWidgetPrompt() {
  const { isNative, platform } = useNativeInfo()
  const [collapsed, setCollapsed] = usePersistentLocalState(
    false,
    'streak-widget-prompt-collapsed'
  )
  if (!isNative || platform !== 'android') return null

  const onAdd = () => {
    track('add streak widget clicked')
    nativePinStreakWidget()
  }

  return (
    <Col className="border-ink-200 bg-canvas-50 mt-2 gap-3 rounded-lg border p-3">
      <Row className="items-center justify-between gap-2">
        <Button color="indigo" size="sm" onClick={onAdd} className="w-fit">
          <PlusIcon className="mr-1 h-4 w-4" />
          Add to home screen
        </Button>
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
              <span className="text-ink-500 text-[10px] font-medium">2x2</span>
            </Col>
            <Col className="items-center gap-1">
              <PreviewTall />
              <span className="text-ink-500 text-[10px] font-medium">2x3</span>
            </Col>
          </Row>
          <span className="text-ink-600 text-sm">
            Add the Manifold streak widget so your streak and quests are one
            glance away.
          </span>
        </>
      )}
    </Col>
  )
}

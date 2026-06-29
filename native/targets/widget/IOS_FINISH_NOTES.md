# iOS Streak Widget — Finish & Consistency Notes

> Handoff notes for finishing the iOS widget so it matches the (done, tested)
> Android widget. The Android side shipped on this branch; iOS is the remaining
> work. **Delete this file before the final merge to `main`.**
>
> Source of truth for shared data: `common/src/native-message.ts`
> (`NativeStreakData` / `NativeQuestItem`). Android render reference:
> `native/widgets/streak-widget.tsx`. The web→native bridge
> (`setStreak` / `setQuests` / `refreshQuests`) is platform-agnostic and already
> feeds iOS — the App Group blobs are written for you by `App.tsx`.

## 1. Blocking: the widget ships in diagnostic mode

`index.swift:22` → `private let kDiagnostic = true`.

While true, `body` (`:267`) and the timeline provider (`:210`, `:217`) take the
**simple** render path and the entire polished `content` design (gradients,
crane watermark, lock-screen live countdown, quest rows) is **dead code**. The
simple path is stable and reads real data, but it is *not* the finished design.

**To finish:** flip to `false`, then verify each rich piece on-device (the
author layered them back one at a time — re-confirm: gradient, watermark image
load, lock-screen countdown timer, quest rows). Do not flip-and-ship blind; the
rich path hasn't been on-device verified, which is why it's gated.

## 2. Quests: data is wired, rendering is not

The decode path exists and works — `loadQuestData()` (`:86`), `questItems()`
(`:127`), reading the `questData` App Group key. The web app already pushes
`setQuests` to iOS (same message Android uses), so the blob is present.

What's missing: the rich **medium** view doesn't render those rows yet
(`trivialEntry`/diagnostic passes `quests: []`). Once `kDiagnostic = false`,
make sure `currentEntry()` threads `questItems(...)` into the entry and the
medium layout renders them. Match Android exactly:

| Quest | Period | Reward | Done style |
|---|---|---|---|
| Share a market | daily (resets midnight PT) | +M5 | ✅ + dimmed text |
| Create a market | weekly (resets Mon midnight PT) | +M100 | ✅ + dimmed text |

(undone rows: ⬜ + full-brightness text). Android source: `QuestRow` in
`streak-widget.tsx`.

## 3. Android ↔ iOS consistency checklist

These are the visual/behavioral places the two platforms currently diverge.
Align iOS to Android (Android is the reviewed reference):

- **Countdown urgency color.** Android steps the countdown color by time left:
  white ≥12h (`0xFFFFFFFF`), amber <12h (`0xFFFFC83C` = rgb 255,200,60), red
  <4h (`0xFFFF5C5C` = rgb 255,92,92). See the patched `RNWidget.java` countdown
  logic. **iOS currently uses one static color** (`index.swift:591`,
  pale blue-white). Add the same thresholds/colors so urgency reads the same on
  both. (iOS countdown is lock-screen-only by design — fine — but it should
  still tier its color.)

- **Pending / logged-out flame.** Android renders a **grey unlit flame outline**
  (custom SVG `UNLIT_FLAME_SVG`) for `pending` and `loggedOut`, not a dimmed 🔥.
  Confirm iOS uses an equivalent unlit/greyed flame rather than a faded emoji so
  the "you haven't bet yet / start a streak" state looks the same.

- **Glyph halo.** Android puts a dark shadow behind the lit/frozen emoji
  (`GLYPH_SHADOW`, `textShadow*`) so 🔥/🧊 don't wash out on the orange
  gradient. Add an equivalent shadow on iOS for the home-screen glyph.

- **Flame gradient.** Android orange→deep-red vs iOS `flameGradient`
  (`index.swift:244`, rgb 1.0,0.54,0.24 → 0.78,0.20,0.10). Eyeball them
  side-by-side; nudge to match.

- **Hook copy + milestones.** Keep the rotating hook strings and milestone
  tiers (🏆) the same set/voice across platforms so copy is consistent.

- **Logged-out state.** Both show a "Start a streak" invite with the unlit
  flame. Confirm wording matches Android.

### Not discrepancies — just so you know
- **Lock-screen widgets** (circular / rectangular / inline) are **iOS-only** —
  Android can't do lock-screen widgets, so there's nothing to mirror there.
- **Storage keys differ by platform on purpose:** Android AsyncStorage uses
  `streakWidgetData` / `streakWidgetQuests`; iOS App Group
  (`group.com.markets.manifold`) uses `streakData` / `questData`. Both are fed
  by the same `setStreak` / `setQuests` web messages via `App.tsx`'s
  platform dispatch — don't "fix" this.
- Adding the App Group entitlement (already in `app.config.js`) triggers a
  one-time EAS credentials re-provision on the next iOS build.

## 4. Non-blocking follow-ups from the branch audit (optional)

- `App.tsx` AppState listener fires `syncStreakFromApi` + `refreshQuests` on
  both `background` and `active` — slightly chatty (a few redundant
  `user/by-id` fetches on rapid app-switch). Left as-is because it's proven on
  device; debounce/active-only if you touch it.
- `web/hooks/use-native-quest-sync.ts` `console.error` doesn't use the repo's
  `error instanceof Error ? …` convention (cosmetic).
- `web/hooks/use-native-messages.ts` logs every native message; `refreshQuests`
  now makes it fire on each foreground (pre-existing log, higher frequency).
- Consider `"postinstall": "patch-package --error-on-fail"` in CI so a future
  failed patch fails the build loudly.

## 5. In-app "Add to home screen" prompt — enable for iOS

There's now a prompt at the bottom of the quests modal
(`web/components/home/add-widget-prompt.tsx`) that nudges users to add the
streak widget, with a live preview (2x2 + 2x3) and a one-tap **Add to home
screen** button. It is **gated to native Android only**
(`isNative && platform === 'android'`) so we don't prompt anyone who can't use
it (web, or iOS while its widget is unfinished).

To enable it for iOS once your widget ships:
- Relax the gate to allow `platform === 'ios'`.
- iOS has **no API to programmatically pin a widget** (Apple forbids it), so for
  iOS show manual instructions instead of the pin button — e.g. "Long-press your
  home screen, tap +, then search Manifold." (There's already a commented note to
  this effect in the component.)
- The Android one-tap path uses a small native module,
  `native/android/.../WidgetPinModule.kt` (wraps `requestPinAppWidget`), invoked
  via the `pinStreakWidget` web→native message (see `App.tsx`). No iOS equivalent
  is needed — manual add only.

**Prebuild caveat (Android):** `WidgetPinModule.kt` / `WidgetPinPackage.kt` and
the `add(WidgetPinPackage())` line in `MainApplication.kt` live in the tracked
`native/android` dir. A `expo prebuild --clean` would regenerate that dir and
drop them. If the project ever moves to clean prebuilds, port this to a config
plugin. (Fine as-is with the current committed-android workflow.)

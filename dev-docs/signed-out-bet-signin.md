# Signed-out bet buttons: sign-in on the press

A/B test `signed-out-bet-signin-v1`. Rules live in
`common/src/signed-out-bet.ts`, the browser side in
`web/lib/util/signed-out-bet.ts`.

## What a signed-out press does

| Surface  | Where                                                                     | Control (today)                                               | Treatment                                                                                 |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ticket` | Market page Yes/No, answer Yes/No and Bet buttons                         | A trade ticket opens. It has its own "Sign up to bet" button. | The ticket opens, and the sign-in window opens with it.                                   |
| `button` | Browse and other list rows, Browse cards, feed and dashboard card buttons | The sign-in window opens. Nothing follows it.                 | The sign-in window opens. Once the visitor is signed in, the ticket they asked for opens. |

Details that matter:

- A ticket opens sign-in once per tab. Someone who closes the window has said
  not now; the ticket's own button is still there. Row and card buttons keep
  asking on every press, as they always have.
- A ticket only asks once auth has settled on "nobody signed in", so the
  window never opens at an account that is still loading.
- A ticket stays open through sign-in, so it needs no help afterwards. A row
  or card leaves nothing behind, so the bet (market, side, location) is kept
  in `sessionStorage` for ten minutes and reopened by `ResumePendingBet`,
  which `Page` mounts.
- On Browse, Home and Feed the reopened ticket waits for the welcome steps.
  Elsewhere nothing runs them, so it opens straight away. The bet stays in
  `sessionStorage` while it waits, so a reload during the welcome steps does
  not lose it.
- It does not reopen on the market's own page, for a closed or resolved
  market, after the ten minutes, or for a different account than the one that
  was signed in when it was taken.
- The native app keeps its own sign-in screen and is not in the test.
- Other bet buttons (sports rows, perps, the election map) are unchanged.

## Assignment and switches

- Unit: the device token (`device:<token>`), which signup also records as
  `initialDeviceToken`. 50/50, decided at the press.
- `NEXT_PUBLIC_SIGNED_OUT_BET_SIGNIN`: unset runs the test. `off` is the kill
  switch: everyone gets control, a bet remembered just before it is dropped,
  and none of the test's events are logged. `on` gives everyone treatment
  once the test has been read, also without the test's events; a bet
  remembered just before it still reopens, unreported. Both need a web
  redeploy to take effect.
- QA: set `localStorage['signed-out-bet-signin-v1-force']` to `control` or
  `treatment`. Forced presses are logged with `forced: true`, including when
  the override is set part-way through a page, and the report leaves the
  device out.

## Events

- `signed-out-bet-signin-v1`: the exposure. Sent on a device's first
  signed-out bet press of a page load, and again on the next press if it
  could not be stored. `variant`, `forced`, `surface`, `location`,
  `contractId`, `environment` (`production`, `preview` or `local`), and
  `firstPressTime`: when this device first pressed a signed-out bet button,
  by its own clock. It is kept in `localStorage`, set once and sent on every
  exposure. The report enrolls the device by it.
- `signed out bet sign-in`: how each sign-in window opened by a bet press
  ended, logged when it settles. `result` is `signed-in` or `not-completed`,
  with Firebase's `code` (for example `auth/popup-closed-by-user`) and `ms`.
- `signed out bet resumed`: a remembered bet's ticket reopened. Only for a
  press that was part of the test.
- `bet intent` now also carries `contractId`, `outcome`, `answerId` on answer
  buttons, and `signedOut`, on the buttons this test touches.
- `click sign up button`: the sidebar and market page Sign up buttons, with
  `location`.

## Reading it

`backend/scripts/signed-out-bet-report.ts` prints, per variant and first
surface: devices, signups within one hour, and bets within 24 hours, each
only for devices old enough to have had the full window. It needs
`SIGNED_OUT_BET_REPORT_DATABASE_URL` (a read-only replica). The query is
`backend/scripts/signed-out-bet-report.sql`; tests are
`yarn test:signed-out-bet`.

How a device is counted:

- It enters once, by its enrollment: its earliest exposure stored within an
  hour of its `firstPressTime`. A device that comes back days later still
  reports the same first press, so it cannot enroll a second time. The
  exposures that qualify fall within two hours of each other, so the report
  reads two hours before its window and always finds the earliest. The
  enrollment is the same event whatever window is asked for.
- Everything else is counted from the device's own enrollment. Reports over
  adjacent windows therefore add up to the report over both.
- Left out, in both variants alike: a device none of whose exposures was
  stored within an hour of its first press; a browser whose clock is more
  than an hour out; a device that used the QA override between two hours
  before its enrollment and a day after it; preview and local presses.
- Logging out clears the device token, so someone who logs out and presses
  again enters as a new device. They can only sign in, not sign up, which
  lowers both variants' rates alike.
- Signup counts any account created on the device in the hour after the
  enrollment, whichever button made it.
- A bet is a non-API buy by that account with a fill inside the 24 hours. A
  resting limit order counts from its first fill, not from when it was
  placed.

What to look at:

- The `ticket` rows are the main comparison: that is where the variants
  differ in whether sign-in opens. The `button` rows differ only in whether
  the bet reopens, so read activation there, not signup.
- The script prints the control/treatment split overall and for each first
  surface. A device enrolls before its variant has changed anything, so each
  split should be even. Treatment opens a window on a ticket press; if that
  ever cost it exposures, the ticket line would show the shortfall.
- `user_events` is indexed by time only. The query reads from two hours
  before the cohort window to a day after it, whatever the age of the test,
  so keep the window to the test's own run.

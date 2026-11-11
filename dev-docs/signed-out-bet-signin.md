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
  once the test has been read, also without the test's events. Both need a
  web redeploy to take effect.
- QA: set `localStorage['signed-out-bet-signin-v1-force']` to `control` or
  `treatment`. Forced presses are logged with `forced: true`, and the report
  leaves the whole device out.

## Events

- `signed-out-bet-signin-v1`: the exposure, on a device's first signed-out bet
  press of a page load. `variant`, `forced`, `surface`, `location`,
  `contractId`, `environment` (`production`, `preview` or `local`), and
  `first`, which is true once per device: the exposure the report enters the
  device by.
- `signed out bet sign-in`: how each sign-in window opened by a bet press
  ended, logged when it settles. `result` is `signed-in` or `not-completed`,
  with Firebase's `code` (for example `auth/popup-closed-by-user`) and `ms`.
- `signed out bet resumed`: a remembered bet's ticket reopened.
- `bet intent` now also carries `contractId`, `outcome`, `answerId` on answer
  buttons, and `signedOut`, on the buttons this test touches.
- `click sign up button`: the sidebar and market page Sign up buttons, with
  `location`.

## Reading it

`backend/scripts/signed-out-bet-report.ts` prints, per variant and first
surface: devices, signups within one hour of the first press, and bets within
24 hours, each only for devices old enough to have had the full window. It
needs `SIGNED_OUT_BET_REPORT_DATABASE_URL` (a read-only replica). The query
is `backend/scripts/signed-out-bet-report.sql`; tests are
`yarn test:signed-out-bet`.

- Signup counts any account created on the device in that hour, whichever
  button made it.
- A bet is a non-API buy by that account with a fill inside the 24 hours. A
  resting limit order counts from its first fill, not from when it was
  placed.
- The `ticket` rows are the main comparison: that is where the variants
  differ in whether sign-in opens. The `button` rows differ only in whether
  the bet reopens, so read activation there, not signup.
- `user_events` is indexed by time only. The query reads the cohort window
  plus one day, whatever the age of the test, so keep the window to the
  test's own run.

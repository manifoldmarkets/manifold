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
  `treatment`. A device that has used the override says so on that exposure
  and on every one after it, and the report leaves the device out. Clearing
  the override does not bring it back; clearing site data does, as a new
  device.

## Events

- `signed-out-bet-signin-v1`: the exposure, once per page load for each
  device, variant and QA override. `variant`, `forced`, `surface`,
  `location`, `contractId`, `environment` (`production`, `preview` or
  `local`), and two fields about the device's enrollment:

  - `firstSurface`: where this device first pressed a signed-out bet button.
  - `sinceFirstPressMs`: how long ago that was when this exposure was sent.
    It is elapsed time, not a clock reading, so a browser clock that is
    wrong makes no difference.

  Both come from one record in `localStorage`, written once. If that record
  cannot be read, or the clock has gone backwards since it was written, the
  exposure leaves both fields out and the report cannot enroll the device.

- An exposure is kept in `localStorage` until it is known to be stored.
  `track()` resolves to whether the event was stored. One that was not is
  sent again after 5 seconds, 30 seconds and 2 minutes, on the next press,
  as every page loads, and when someone signs in, for up to an hour. A
  visitor who signs up straight after a press never presses signed-out
  again, so resending cannot wait for a press.
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
surface: devices, signups within one hour of the first press, and bets
within 24 hours of it, each only for devices old enough to have had the full
window. It needs `SIGNED_OUT_BET_REPORT_DATABASE_URL` (a read-only replica).
The query is `backend/scripts/signed-out-bet-report.sql`; tests are
`yarn test:signed-out-bet`.

How a device is counted:

- An exposure sent within an hour of the device's first press can enroll it.
  The device enrolls by its earliest such exposure, at the moment that
  exposure says the press happened: its stored time less
  `sinceFirstPressMs`. So a device enters once however many exposures it
  sends, an exposure that arrives late still places the device at its
  press, and a device that comes back days later cannot enter again.
- Everything else is counted from that moment, not from the edges of what
  was read: the window the device falls in, its outcomes, the QA exclusion
  and the conflict flag. Reports over adjacent windows therefore add up to
  the report over both. The script relies on this: it reads the range one
  UTC day at a time and adds the days up.
- Left out, in both variants alike: a device none of whose exposures could
  be sent within an hour of its first press; a device that has used the QA
  override; preview and local presses.
- Signup counts any account created on the device in the hour after the
  first press, whichever button made it.
- A bet is a non-API buy by that account with a fill inside the 24 hours. A
  resting limit order counts from its first fill, not from when it was
  placed.
- Logging out clears the device token, so someone who logs out and presses
  again enters as a new device. They can only sign in, not sign up, which
  lowers both variants' rates alike.

What the browser is trusted for. The enrollment rests on one record in the
visitor's own `localStorage` and on events any client can write. Clearing
site data makes a new device, as it does for every device-keyed count.
Deleting that one record by hand while keeping the device token, setting the
clock back between visits, or writing events by hand can enroll a device
twice. None of these happens in ordinary use. Ruling them out would take an
enrollment table on the server with one row per device, which needs a
migration.

What to look at:

- The `ticket` rows are the main comparison: that is where the variants
  differ in whether sign-in opens. The `button` rows differ only in whether
  the bet reopens, so read activation there, not signup.
- The script prints the control/treatment split overall and for each first
  surface. A device enrolls before its variant has changed anything, so each
  split should be even. Treatment opens a window on a ticket press; if that
  ever cost it exposures, the ticket line would show the shortfall.
- `user_events` is indexed by time only, so reading a day of it means
  reading every event of that day, which takes several seconds when nothing
  is cached. Each of the script's queries reads the hour before its day, the
  day, and the day after.

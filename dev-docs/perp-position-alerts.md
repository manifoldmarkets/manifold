# Perp position alerts

Adds actionable position alerts before liquidation, alongside the existing liquidation and ADL notifications. Position alerts are advisory and never place or close trades.

## Exchange research

- [Bybit trade settings](https://www.bybit.com/my-MM/help-center/article/How-to-activate-deactivate-trade-option-settings) supports price/percentage alerts from the trading chart, including one-time alerts and repeat-frequency choices. We adopt controls in the position panel and persistent one-time milestones.
- [OKX liquidation alerts](https://www.okx.com/en-gb/help/how-do-i-set-up-a-liquidation-alert) exposes liquidation warnings in trading preferences and supports web/push delivery. We adopt separate risk-warning controls and escalating warnings.

These sources inform the interaction patterns. The thresholds below are Manifold product choices, not exchange defaults. Exchange margin ratios are not interchangeable with Manifold's isolated position math.

## Behavior

| Alert               | Thresholds                                        | Default channels                  |
| ------------------- | ------------------------------------------------- | --------------------------------- |
| Profit              | +50%, +100%, +200%, +500%, +1,000% net return     | Web                               |
| Loss                | −25%, −50% net return                             | Web                               |
| Liquidation warning | 25%, then 10%, of current margin buffer remaining | Web and mobile push, if available |

Returns match the position card: current value minus original margin and opening/add fees, divided by original margin plus those fees. Funding is included in current value. This is the return on committed mana, not the percentage move of the underlying price. Alerts quote current observed return and unrealized P&L.

Risk uses current position value / funding-adjusted cost basis. A newly opened 50× position therefore starts with roughly its full buffer, rather than immediately warning because its liquidation price is nearby in percentage terms. Risk copy includes the observed oracle price, liquidation price, and remaining price distance. Positions already at/past liquidation are left to the liquidation engine.

Controls live under **Position alerts** below open positions and **Notifications → Settings → Perps**. Settings apply to all of the user's positions. Each category has independent web and mobile switches, honors channel-wide opt-outs, and offers no email option. Existing liquidation/ADL settings are unchanged.

## Noise controls and lifecycle

- A price jump across several tiers produces only the highest tier. Profit and loss milestones are each consumed once per position lifetime (`openedTime`); funding, adding margin, and partial closes do not rearm them.
- Gain/loss alerts share a rolling 24-hour maximum of three per user and a one-hour cooldown across all positions. Muted and rate-limited milestones are consumed, not queued for later delivery.
- Risk takes priority over loss at the same observation and bypasses the gain/loss cap. Each risk severity sends at most once per episode. Rearming requires observed recovery above 50% margin remaining and six hours since the last warning; escalation to 10% does not wait.
- The first observation baselines existing profit/loss without notifications. Existing risk can warn immediately. A close/reopen starts a new lifetime, which is baselined on its first scan too. A move entirely before the first scan may not generate a profit/loss alert.
- State remains independent of notification retention. Closed-position entries are pruned on the user's next scan; a user's final closed entry can remain until their next position opens. Reopening uses its new timestamp regardless.

## Delivery and rollout

Apply `backend/supabase/migrations/2026091201_perp_alert_states.sql` before deploying the scheduler. The new table has RLS enabled, no client policies, and explicit revocation of access for anon/authenticated roles. No production migration is run by this change.

`send-perp-position-alerts` runs every minute on the perps scheduler, separately from the two-second oracle tick. It reads positions and committed contract prices in one snapshot and skips stale/unavailable feeds, solvency halts, resolved markets, and terminal/invalid positions. It does not change the trading engine or acquire trading locks.

Per-user advisory locks serialize duplicate workers and enforce the shared cap. In-app notification inserts and alert state commit together; websocket broadcasts follow commit. Mobile delivery is best-effort with at most one attempt: process/Expo failures after commit can lose a push, but cannot cause recurring pushes or undo a web notification. There is no guaranteed warning before liquidation, especially between scans or during downtime.

The settings endpoint preserves default channels when a newly introduced preference has not yet been stored. For example, disabling mobile liquidation warnings preserves the default web channel.

## Validation

Automated coverage exercises both position directions, thresholds, jumps, fees/funding, cooldowns, risk hysteresis, partial close/reopen, opt-outs and missing preferences, stale/paused/resolved markets, transactional rollback/retry, independent browser/mobile delivery, and push failures. A separate PostgreSQL integration suite verifies the migration and access restrictions, eight concurrent worker scans, rollback/retry, and the real settings endpoint's default-channel preservation. Deployed UI interaction and actual push delivery still need staging verification.

To run integration tests, point `PERP_ALERT_TEST_DATABASE_URL` at a disposable PostgreSQL database named `perp_alert_test` on localhost and run the shared Jest suite's `perp-position-alerts.integration.test.ts`. The suite creates fixture tables and clears their data. It refuses remote hosts or other database names and is skipped when the variable is unset. It passed against PostgreSQL 16.

Staging checks: apply the migration; open a position and let it baseline; cross +100%; confirm one web notification and correct market link; enable mobile and cross another eligible threshold; turn off each channel independently; cross risk levels and recover; run overlapping worker scans; confirm a forced transaction rollback permits exactly one retry notification.

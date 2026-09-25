import { contractPathWithoutContract } from 'common/contract'
import { PERP_OPEN_INTEREST_COVER_MULTIPLE } from 'common/perps/amm'
import { getOracleFreshness } from 'common/perps/oracle'
import {
  OPEN_WEIGHT_MODELS,
  UNCLASSIFIED_GRACE_WINDOW_MS,
} from 'common/perps/open-weight-models'
import { getMerchItemIds, getShopItemOrRetired } from 'common/shop/items'
import { formatMoney } from 'common/util/format'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { ORACLE_FEEDS } from 'shared/oracle-feeds'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'

import { APIHandler } from './helpers/endpoint'
import { getPerpTradingMode } from './helpers/perp-trading-mode'

// The one page an admin should have to open each day.
//
// Everything here answers "is there something a human has to do?" — never
// "how are we doing?". A metric that is merely interesting belongs on /stats;
// putting it here trains the reader to skim, and a skimmed queue is the same
// as no queue. The moderation queues are deliberately absent: /admin/reports
// and /admin/spam already work and have their own rhythm.
//
// Each item carries its own href to wherever the action is actually taken, so
// this page never grows mutating controls of its own — it stays a read-only
// aggregate that can be rebuilt or deleted without risk.

type TodoEntry = {
  label: string
  sublabel?: string
  href?: string
}

type TodoItem = {
  id: string
  category: 'merch' | 'prizes' | 'perps' | 'payments'
  /**
   * `overdue` — someone is already waiting longer than they should be.
   * `todo` — real work, not yet late.
   * `waiting` — not today's work: blocked on someone outside the team, or a
   * stale backlog to reconcile once. Shown so it is not mistaken for
   * something forgotten, never counted toward the open count.
   */
  severity: 'overdue' | 'todo' | 'waiting'
  title: string
  detail: string
  actionLabel: string
  actionHref: string
  count: number
  entries: TodoEntry[]
}

// Rows shown inline per item. The feed is a queue, not a table: enough to
// recognise what is waiting without a click, and a link for the rest.
const MAX_ENTRIES = 6

// A merch draft nobody has confirmed on Printful within two days is late.
// Orders normally clear the same day, so this is generous rather than tight.
const MERCH_OVERDUE_MS = 2 * DAY_MS

// A winner who has handed over a wallet address is owed money; a day is
// already a long time to sit on that.
const PAYOUT_OVERDUE_MS = DAY_MS

// A review queue whose NEWEST entry is this old has stopped receiving work.
// What is left is a one-off reconciliation, and dressing it up as today's
// urgent task every morning is how a daily page gets ignored.
const CASHOUT_ABANDONED_MS = 60 * DAY_MS

// A side this close to its cover limit will start rejecting opens shortly,
// and the true limit is tighter than the bound computed here (see below).
const CAPACITY_WARN_FRACTION = 0.8

const ageMsOf = (time: string | Date) => Date.now() - new Date(time).getTime()

/** Milliseconds until a future timestamp; negative once it has passed. */
const untilMsOf = (time: string | Date) => new Date(time).getTime() - Date.now()

const formatAge = (ms: number) => {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`
  return `${Math.round(ms / DAY_MS)}d`
}

const formatUsd = (amount: number) =>
  `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export const getAdminTodo: APIHandler<'get-admin-todo'> = async (_, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()

  const merchItemIds = getMerchItemIds()

  const [
    merchOrders,
    awaitingPayouts,
    winnersWithoutWallet,
    drawingsToDraw,
    drawingsToAnnounce,
    giveawaysToDraw,
    cashoutsToReview,
    livePerps,
    feedHeads,
    pendingModels,
  ] = await Promise.all([
    // Merch that has been paid for and has not shipped. Printful orders are
    // created as drafts (`confirm: false`), so PENDING_FULFILLMENT literally
    // means "a human still has to approve this on Printful". CREATED and
    // COMPLETED are included because the status column is shared with the
    // digital shop and an unexpected value here should surface, not vanish.
    pg.manyOrNone<{
      id: string
      item_id: string
      status: string
      created_time: string
      printful_order_id: string | null
      metadata: { size?: string; color?: string } | null
      username: string
    }>(
      `select o.id, o.item_id, o.status, o.created_time, o.printful_order_id,
              o.metadata, u.username
       from shop_orders o
       join users u on u.id = o.user_id
       where o.item_id = any($1)
         and o.status in ('CREATED', 'PENDING_FULFILLMENT', 'COMPLETED')
       order by o.created_time asc`,
      [merchItemIds]
    ),

    // Winners who have given us an address and are waiting on the transfer.
    pg.manyOrNone<{
      sweepstakes_num: number
      rank: number
      prize_amount_usdc: string
      created_time: string
      username: string
    }>(
      `select c.sweepstakes_num, c.rank, c.prize_amount_usdc, c.created_time,
              u.username
       from sweepstakes_prize_claims c
       join users u on u.id = c.user_id
       where c.payment_status = 'awaiting'
         and c.wallet_address is not null
       order by c.sweepstakes_num desc, c.rank asc`
    ),

    // Winners who have not submitted a wallet yet. Not our work — but if a
    // drawing sits unfinished for weeks this is usually why, and without it
    // the page would imply the drawing was already fully settled.
    pg.manyOrNone<{
      sweepstakes_num: number
      rank: number
      username: string
    }>(
      `select s.sweepstakes_num, w.ord::int as rank, u.username
       from sweepstakes s
       cross join lateral unnest(s.winning_ticket_ids)
         with ordinality as w(ticket_id, ord)
       join sweepstakes_tickets t on t.id = w.ticket_id
       join users u on u.id = t.user_id
       left join sweepstakes_prize_claims c
         on c.sweepstakes_num = s.sweepstakes_num and c.user_id = t.user_id
       where s.winning_ticket_ids is not null
         and s.close_time > now() - interval '90 days'
         and c.wallet_address is null
         and (c.payment_status is null or c.payment_status = 'awaiting')
       order by s.sweepstakes_num desc, w.ord asc`
    ),

    // Closed with no winners drawn yet.
    pg.manyOrNone<{
      sweepstakes_num: number
      name: string
      close_time: string
    }>(
      `select sweepstakes_num, name, close_time
       from sweepstakes
       where winning_ticket_ids is null and close_time < now()
       order by close_time asc`
    ),

    // Open drawings nobody has announced. Restricted to drawings that are
    // still running: once a drawing has closed the announcement is moot, and
    // rows predating the flag would otherwise show up forever.
    pg.manyOrNone<{
      sweepstakes_num: number
      name: string
      close_time: string
    }>(
      `select sweepstakes_num, name, close_time
       from sweepstakes
       where not announcement_sent
         and winning_ticket_ids is null
         and close_time > now()
       order by close_time asc`
    ),

    pg.manyOrNone<{
      giveaway_num: number
      name: string
      prize_amount_usd: string
      close_time: string
    }>(
      `select giveaway_num, name, prize_amount_usd, close_time
       from charity_giveaways
       where winning_ticket_id is null and close_time < now()
       order by close_time asc`
    ),

    // Cash redemptions parked for manual review. Mirrors the `review_cashouts`
    // arm of get-cashouts: a delete_after_reading row still holding the bank
    // details is what makes one reviewable.
    pg.manyOrNone<{
      username: string
      created_time: string
      payout_in_dollars: string | null
    }>(
      `select u.username, t.created_time,
              (t.data->'data'->>'payoutInDollars')::numeric as payout_in_dollars
       from delete_after_reading d
       join txns t on d.data->>'txnId' = t.id
       join users u on u.id = d.user_id
       where t.category = 'CASH_OUT'
       order by t.created_time asc`
    ),

    pg.manyOrNone<{
      id: string
      slug: string
      question: string
      creator_username: string
      feed_id: string | null
      oracle_price_time: string | null
      max_oracle_price_age_ms: string | null
      pool_long: string | null
      pool_short: string | null
      oi_long: string | null
      oi_short: string | null
    }>(
      `select id, slug, question,
              data->>'creatorUsername' as creator_username,
              data->>'oracleFeedId' as feed_id,
              data->>'oraclePriceTime' as oracle_price_time,
              data->>'maxOraclePriceAgeMs' as max_oracle_price_age_ms,
              data->>'poolLong' as pool_long,
              data->>'poolShort' as pool_short,
              data->>'openInterestLong' as oi_long,
              data->>'openInterestShort' as oi_short
       from contracts
       where mechanism = 'perp' and resolution_time is null`
    ),

    pg.manyOrNone<{ feed_id: string; latest_published_at: string }>(
      `select feed_id, max(published_at) as latest_published_at
       from oracle_prices
       group by feed_id`
    ),

    pg.manyOrNone<{ permaslug: string; first_ranked_at: string | null }>(
      `select permaslug, first_ranked_at
       from model_classifications
       where open is null
       order by first_ranked_at asc nulls last`
    ),
  ])

  const items: TodoItem[] = []

  // ---------- merch ----------

  if (merchOrders.length > 0) {
    const oldestAge = ageMsOf(merchOrders[0].created_time)
    const drafts = merchOrders.filter((o) => o.status === 'PENDING_FULFILLMENT')
    const needsPrintfulLink = merchOrders.filter((o) => !o.printful_order_id)
    items.push({
      id: 'merch-unshipped',
      category: 'merch',
      severity: oldestAge > MERCH_OVERDUE_MS ? 'overdue' : 'todo',
      title: `${merchOrders.length} merch order${
        merchOrders.length === 1 ? '' : 's'
      } not shipped`,
      detail:
        `Paid for and not yet shipped. Oldest is ${formatAge(oldestAge)} old.` +
        (drafts.length > 0
          ? ` ${drafts.length} sit${
              drafts.length === 1 ? 's' : ''
            } on Printful as an unconfirmed draft — nothing goes into production until someone approves it there.`
          : '') +
        (needsPrintfulLink.length > 0
          ? ` ${needsPrintfulLink.length} never got a Printful order id and needs reconciling by hand.`
          : ''),
      actionLabel: 'Open merch admin',
      actionHref: '/admin/merch',
      count: merchOrders.length,
      entries: merchOrders.slice(0, MAX_ENTRIES).map((o) => {
        const item = getShopItemOrRetired(o.item_id)
        const variant = [o.metadata?.color, o.metadata?.size]
          .filter(Boolean)
          .join(' / ')
        return {
          label: `@${o.username} — ${item?.name ?? o.item_id}${
            variant ? ` (${variant})` : ''
          }`,
          sublabel: `${formatAge(ageMsOf(o.created_time))} old · ${o.status}${
            o.printful_order_id ? '' : ' · no Printful id'
          }`,
          href: `/${o.username}`,
        }
      }),
    })
  }

  // ---------- prize drawings ----------

  if (awaitingPayouts.length > 0) {
    const totalUsdc = awaitingPayouts.reduce(
      (sum, c) => sum + Number(c.prize_amount_usdc),
      0
    )
    // Ordered by drawing, not by age, so the oldest wait is a max over rows.
    const oldest = Math.max(
      ...awaitingPayouts.map((c) => ageMsOf(c.created_time))
    )
    items.push({
      id: 'prize-payouts-awaiting',
      category: 'prizes',
      severity: oldest > PAYOUT_OVERDUE_MS ? 'overdue' : 'todo',
      title: `${formatUsd(totalUsdc)} owed to ${
        awaitingPayouts.length
      } prize winner${awaitingPayouts.length === 1 ? '' : 's'}`,
      detail:
        `Wallet addresses submitted, payment not sent. The admin page has ` +
        `the address-and-amount CSV ready to paste. Oldest has waited ${formatAge(
          oldest
        )}.`,
      actionLabel: 'Open prize payouts',
      actionHref: '/admin/prize',
      count: awaitingPayouts.length,
      entries: awaitingPayouts.slice(0, MAX_ENTRIES).map((c) => ({
        label: `@${c.username} — ${formatUsd(Number(c.prize_amount_usdc))}`,
        sublabel: `Drawing #${c.sweepstakes_num} · rank ${
          c.rank
        } · waiting ${formatAge(ageMsOf(c.created_time))}`,
        href: `/${c.username}`,
      })),
    })
  }

  if (drawingsToDraw.length > 0) {
    items.push({
      id: 'prize-drawings-undrawn',
      category: 'prizes',
      severity: 'overdue',
      title: `${drawingsToDraw.length} prize drawing${
        drawingsToDraw.length === 1 ? '' : 's'
      } closed without winners`,
      detail:
        'Ticket sales are over and no winners have been selected. Nobody can ' +
        'claim until this runs.',
      actionLabel: 'Open /prize',
      actionHref: '/prize',
      count: drawingsToDraw.length,
      entries: drawingsToDraw.map((d) => ({
        label: d.name,
        sublabel: `Closed ${formatAge(ageMsOf(d.close_time))} ago`,
      })),
    })
  }

  if (giveawaysToDraw.length > 0) {
    items.push({
      id: 'charity-giveaways-undrawn',
      category: 'prizes',
      severity: 'overdue',
      title: `${giveawaysToDraw.length} charity giveaway${
        giveawaysToDraw.length === 1 ? '' : 's'
      } closed without a winner`,
      detail: 'Closed giveaway with no winning ticket drawn yet.',
      actionLabel: 'Open /charity',
      actionHref: '/charity',
      count: giveawaysToDraw.length,
      entries: giveawaysToDraw.map((g) => ({
        label: `${g.name} — ${formatUsd(Number(g.prize_amount_usd))}`,
        sublabel: `Closed ${formatAge(ageMsOf(g.close_time))} ago`,
      })),
    })
  }

  if (drawingsToAnnounce.length > 0) {
    items.push({
      id: 'prize-drawings-unannounced',
      category: 'prizes',
      severity: 'todo',
      title: `${drawingsToAnnounce.length} live prize drawing${
        drawingsToAnnounce.length === 1 ? '' : 's'
      } never announced`,
      detail:
        'Open for entries but the announcement notification has not been ' +
        'sent, so most users do not know it exists.',
      actionLabel: 'Open /prize',
      actionHref: '/prize',
      count: drawingsToAnnounce.length,
      entries: drawingsToAnnounce.map((d) => ({
        label: d.name,
        sublabel: `Closes in ${formatAge(untilMsOf(d.close_time))}`,
      })),
    })
  }

  if (winnersWithoutWallet.length > 0) {
    items.push({
      id: 'prize-winners-no-wallet',
      category: 'prizes',
      severity: 'waiting',
      title: `${winnersWithoutWallet.length} prize winner${
        winnersWithoutWallet.length === 1 ? '' : 's'
      } have not sent a wallet`,
      detail:
        'Blocked on the winner, not on us. Listed so an unfinished drawing ' +
        'is not mistaken for a missed payment.',
      actionLabel: 'Open prize payouts',
      actionHref: '/admin/prize',
      count: winnersWithoutWallet.length,
      entries: winnersWithoutWallet.slice(0, MAX_ENTRIES).map((w) => ({
        label: `@${w.username}`,
        sublabel: `Drawing #${w.sweepstakes_num} · rank ${w.rank}`,
        href: `/${w.username}`,
      })),
    })
  }

  // ---------- cash redemptions ----------

  if (cashoutsToReview.length > 0) {
    const total = cashoutsToReview.reduce(
      (sum, c) => sum + Number(c.payout_in_dollars ?? 0),
      0
    )
    // Newest first. The queue is oldest-first everywhere else, but this table
    // carries a long-abandoned tail, and oldest-first would push a redemption
    // filed this morning off the bottom of the card behind rows from 2025.
    const newestFirst = [...cashoutsToReview].reverse()
    const newestAge = ageMsOf(newestFirst[0].created_time)
    const oldestAge = ageMsOf(cashoutsToReview[0].created_time)
    const looksAbandoned = newestAge > CASHOUT_ABANDONED_MS
    items.push({
      id: 'cashouts-needs-review',
      category: 'payments',
      // A queue where even the newest entry is months old is a cleanup job,
      // not a daily one. Calling it overdue every morning forever is how a
      // page like this stops being read.
      severity: looksAbandoned
        ? 'waiting'
        : newestAge > PAYOUT_OVERDUE_MS
        ? 'overdue'
        : 'todo',
      title: `${cashoutsToReview.length} cash redemption${
        cashoutsToReview.length === 1 ? '' : 's'
      } need review`,
      detail:
        `${formatUsd(total)} of withdrawals held for manual approval. ` +
        (looksAbandoned
          ? `Nothing new here in ${formatAge(
              newestAge
            )} — this is a stale backlog to reconcile once, not daily work. It ` +
            'stops appearing when the rows are resolved or cleared.'
          : `Oldest has waited ${formatAge(oldestAge)}.`),
      actionLabel: 'Open redemptions',
      actionHref: '/admin/redemptions',
      count: cashoutsToReview.length,
      entries: newestFirst.slice(0, MAX_ENTRIES).map((c) => ({
        label: `@${c.username} — ${formatUsd(
          Number(c.payout_in_dollars ?? 0)
        )}`,
        sublabel: `Requested ${formatAge(ageMsOf(c.created_time))} ago`,
        href: `/${c.username}`,
      })),
    })
  }

  // ---------- perps ----------

  const tradingMode = getPerpTradingMode()
  if (tradingMode !== 'enabled') {
    items.push({
      id: 'perp-trading-mode',
      category: 'perps',
      severity: 'overdue',
      title: `Perp trading is ${tradingMode}`,
      detail:
        tradingMode === 'halted'
          ? 'All user-initiated perp trading is blocked, including closes. ' +
            'This is an incident setting — clear it once the incident is over.'
          : 'Perps accept closes only; no new or increased exposure. This is ' +
            'an incident setting — clear it once the incident is over.',
      actionLabel: 'Review perp markets',
      actionHref: '/admin/create-perp',
      count: 1,
      entries: [
        {
          label: 'Cleared by setting PERP_TRADING_MODE=enabled',
          sublabel:
            'Environment change — the API instances have to be rolled before ' +
            'it takes effect.',
        },
      ],
    })
  }

  const feedHeadMs = new Map(
    feedHeads.map((f) => [f.feed_id, new Date(f.latest_published_at).getTime()])
  )

  // A live market whose cached mark has aged past its own tolerance is
  // frozen: opens and closes both refuse until a fresh point lands.
  const frozenPerps = livePerps.filter((c) => {
    const maxAge = Number(c.max_oracle_price_age_ms)
    return (
      getOracleFreshness(Number(c.oracle_price_time), maxAge).status !== 'fresh'
    )
  })
  if (frozenPerps.length > 0) {
    items.push({
      id: 'perp-frozen-markets',
      category: 'perps',
      severity: 'overdue',
      title: `${frozenPerps.length} perp market${
        frozenPerps.length === 1 ? ' is' : 's are'
      } frozen on a stale price`,
      detail:
        'The cached mark is older than the market tolerates, so trading and ' +
        'closing are both paused until the feed publishes again.',
      actionLabel: 'Review perp markets',
      actionHref: '/admin/create-perp',
      count: frozenPerps.length,
      entries: frozenPerps.map((c) => {
        const markTime = Number(c.oracle_price_time)
        const tolerance = Number(c.max_oracle_price_age_ms)
        return {
          label: c.question,
          sublabel: `${c.feed_id ?? 'no feed'} · ${
            Number.isFinite(markTime) && markTime > 0
              ? `mark ${formatAge(Date.now() - markTime)} old`
              : 'no cached mark'
          } · ${
            Number.isFinite(tolerance) && tolerance > 0
              ? `tolerance ${formatAge(tolerance)}`
              : 'no tolerance set'
          }`,
          href: contractPathWithoutContract(c.creator_username, c.slug),
        }
      }),
    })
  }

  // Feed-level health, independent of any one market's tolerance: a feed can
  // be silently dead for hours while a market with a loose tolerance still
  // trades against the last point it wrote.
  const usedFeedIds = new Set(
    livePerps.map((c) => c.feed_id).filter((id): id is string => !!id)
  )
  const staleFeeds = ORACLE_FEEDS.filter((feed) => {
    if (!usedFeedIds.has(feed.id)) return false
    const head = feedHeadMs.get(feed.id)
    return head === undefined || Date.now() - head > feed.staleAfterMs
  })
  if (staleFeeds.length > 0) {
    items.push({
      id: 'perp-stale-feeds',
      category: 'perps',
      severity: 'overdue',
      title: `${staleFeeds.length} oracle feed${
        staleFeeds.length === 1 ? ' is' : 's are'
      } stale`,
      detail:
        'A feed backing a live market has not published inside its own ' +
        'staleness window. The ingest job is the first thing to check.',
      actionLabel: 'Open scheduler logs',
      actionHref:
        'https://console.cloud.google.com/logs/query;query=%22%5Boracle-feeds%5D%22',
      count: staleFeeds.length,
      entries: staleFeeds.map((feed) => {
        const head = feedHeadMs.get(feed.id)
        return {
          label: feed.id,
          sublabel:
            head === undefined
              ? 'never published'
              : `last point ${formatAge(
                  Date.now() - head
                )} ago · stale after ${formatAge(feed.staleAfterMs)}`,
        }
      }),
    })
  }

  // Exposure headroom. `limit` here uses the RAW opposing pool, while the
  // engine deducts each opposite-side position's refundable value first — so
  // the real limit is always at or below this one. That direction is chosen
  // deliberately: everything this flags is genuinely constrained, and the
  // page never cries wolf. It will miss markets that are already blocked.
  const tightPerps = livePerps.flatMap((c) => {
    const poolLong = Number(c.pool_long)
    const poolShort = Number(c.pool_short)
    const oiLong = Number(c.oi_long ?? 0)
    const oiShort = Number(c.oi_short ?? 0)
    return (['long', 'short'] as const).flatMap((side) => {
      const openInterest = side === 'long' ? oiLong : oiShort
      const cover = side === 'long' ? poolShort : poolLong
      const limit = Math.max(cover, 0) * PERP_OPEN_INTEREST_COVER_MULTIPLE
      if (
        !Number.isFinite(limit) ||
        limit <= 0 ||
        !Number.isFinite(openInterest)
      )
        return []
      const used = openInterest / limit
      if (used < CAPACITY_WARN_FRACTION) return []
      return [{ contract: c, side, used, openInterest, limit }]
    })
  })
  if (tightPerps.length > 0) {
    items.push({
      id: 'perp-capacity',
      category: 'perps',
      severity: tightPerps.some((t) => t.used >= 1) ? 'overdue' : 'todo',
      title: `${tightPerps.length} perp side${
        tightPerps.length === 1 ? ' is' : 's are'
      } near the exposure cap`,
      detail:
        `Open interest is within ${Math.round(
          (1 - CAPACITY_WARN_FRACTION) * 100
        )}% of ${PERP_OPEN_INTEREST_COVER_MULTIPLE}× the opposing pool, so ` +
        'that side will start rejecting opens. Subsidising the opposing pool ' +
        'raises the cap. The true cap is lower than shown — this ignores the ' +
        'reserves the engine deducts, so a side can already be blocked here.',
      actionLabel: 'Review perp markets',
      actionHref: '/admin/create-perp',
      count: tightPerps.length,
      entries: tightPerps.map((t) => ({
        label: `${t.contract.question} — ${t.side}`,
        sublabel: `${formatMoney(
          Math.round(t.openInterest)
        )} open vs ${formatMoney(Math.round(t.limit))} cap (${Math.round(
          t.used * 100
        )}%)`,
        href: contractPathWithoutContract(
          t.contract.creator_username,
          t.contract.slug
        ),
      })),
    })
  }

  // Only a ranked model has a deadline. The rest is backlog the index is not
  // waiting on, and reporting it as work would bury the models that matter.
  const rankedPending = pendingModels.filter(
    (m) => m.first_ranked_at !== null && !OPEN_WEIGHT_MODELS[m.permaslug]
  )
  const graceExpired = rankedPending.filter(
    (m) =>
      Date.now() - new Date(m.first_ranked_at as string).getTime() >
      UNCLASSIFIED_GRACE_WINDOW_MS
  )
  if (rankedPending.length > 0) {
    items.push({
      id: 'perp-model-classifications',
      category: 'perps',
      severity: graceExpired.length > 0 ? 'overdue' : 'todo',
      title: `${rankedPending.length} ranked model${
        rankedPending.length === 1 ? '' : 's'
      } unclassified`,
      detail:
        graceExpired.length > 0
          ? `${graceExpired.length} past the grace window — the open-weight ` +
            'index is halted and the perp is marking against a frozen price.'
          : 'In the index and unclassified. The index halts once any of them ' +
            'passes the grace window.',
      actionLabel: 'Classify models',
      actionHref: '/admin/model-classifications',
      count: rankedPending.length,
      entries: rankedPending.slice(0, MAX_ENTRIES).map((m) => ({
        label: m.permaslug,
        sublabel: `ranked ${formatAge(
          ageMsOf(m.first_ranked_at as string)
        )} ago · grace ${formatAge(UNCLASSIFIED_GRACE_WINDOW_MS)}`,
      })),
    })
  }

  // Feeds we are already paying to ingest, cleared for market creation, with
  // nothing trading on them. Not urgent, but it is the only place this is
  // visible and it goes unnoticed for weeks otherwise.
  const idleFeeds = ORACLE_FEEDS.filter(
    (feed) =>
      feed.marketCreationEnabled &&
      !usedFeedIds.has(feed.id) &&
      feedHeadMs.has(feed.id)
  )
  if (idleFeeds.length > 0) {
    items.push({
      id: 'perp-idle-feeds',
      category: 'perps',
      severity: 'todo',
      title: `${idleFeeds.length} oracle feed${
        idleFeeds.length === 1 ? ' has' : 's have'
      } no market`,
      detail:
        'Ingesting and cleared for market creation, but nothing trades on ' +
        'them yet.',
      actionLabel: 'Create a perp market',
      actionHref: '/admin/create-perp',
      count: idleFeeds.length,
      entries: idleFeeds.map((feed) => ({
        label: feed.id,
        sublabel: feed.description,
      })),
    })
  }

  const openCount = items.filter((i) => i.severity !== 'waiting').length

  return { items, openCount, generatedAt: Date.now() }
}

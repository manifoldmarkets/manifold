import { createHash } from 'crypto'

import { type ErrorCode } from 'common/api/utils'
import { getFirstBlockAfter } from 'common/bitcoin'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { formatMoneyUSD } from 'common/util/format'
import { nanoid } from 'common/util/random'
import {
  getPrizeForRank,
  getOrdinalSuffix,
  getTotalPrizePool,
  getTotalWinnerCount,
  type SweepstakesPrize,
} from 'common/sweepstakes'
import { type Notification, type PrizeWinnerData } from 'common/notification'
import { createPrizeCampaignNotification } from 'shared/notifications/create-prize-campaign-notification'
import {
  type SupabaseDirectClient,
  type SupabaseDirectClientTimeout,
} from 'shared/supabase/init'
import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { log } from 'shared/utils'

export class SweepstakesError extends Error {
  constructor(
    public status: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

export const createSweepstakes = async (
  pg: SupabaseDirectClient,
  closeTime: number,
  prizes: SweepstakesPrize[]
) => {
  if (!prizes.length) {
    throw new SweepstakesError(400, 'At least one prize is required')
  }

  if (prizes.some((p) => p.amountUsdc <= 0)) {
    throw new SweepstakesError(400, 'All prize amounts must be greater than 0')
  }

  if (closeTime <= Date.now()) {
    throw new SweepstakesError(400, 'Close time must be in the future')
  }

  const active = await pg.oneOrNone<{
    sweepstakes_num: number
  }>(
    `SELECT sweepstakes_num
     FROM sweepstakes
     WHERE close_time > NOW()
     ORDER BY close_time DESC
     LIMIT 1`
  )

  if (active) {
    throw new SweepstakesError(400, 'An active drawing already exists')
  }

  const nextNum = await pg.oneOrNone<{ next_num: number }>(
    `SELECT COALESCE(MAX(sweepstakes_num), 0) + 1 AS next_num FROM sweepstakes`
  )

  const sweepstakesNum = nextNum?.next_num ?? 1
  const name = `Prize Drawing #${sweepstakesNum}`

  const normalizedPrizes: SweepstakesPrize[] = prizes.map((p, index) => ({
    rank: p.rank ?? index + 1,
    amountUsdc: p.amountUsdc,
    label: p.label || `${index + 1}${getOrdinalSuffix(index + 1)}`,
  }))

  await pg.none(
    `INSERT INTO sweepstakes (sweepstakes_num, name, prizes, close_time)
     VALUES ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0))`,
    [sweepstakesNum, name, JSON.stringify(normalizedPrizes), closeTime]
  )

  try {
    const totalPrizeUsd = getTotalPrizePool(normalizedPrizes)
    await createPrizeCampaignNotification(pg, {
      reason: 'prize_drawings',
      eventType: 'created',
      sourceSlug: `prize/${sweepstakesNum}`,
      title: 'New prize drawing',
      body: `${formatMoneyUSD(totalPrizeUsd)} in total prizes.`,
      data: {
        eventType: 'created',
        sweepstakesNum,
        totalPrizeUsd,
        closeTime,
      },
    })
  } catch (err) {
    log.error('Failed to send prize drawing notifications', { err })
  }

  return { sweepstakesNum }
}

export const selectSweepstakesWinners = async (
  pg: SupabaseDirectClientTimeout,
  sweepstakesNum: number
) => {
  return await pg.tx(async (tx) => {
    const sweepstakes = await tx.oneOrNone<{
      sweepstakes_num: number
      close_time: string
      winning_ticket_ids: string[] | null
      prizes: SweepstakesPrize[]
    }>(
      `SELECT sweepstakes_num, close_time, winning_ticket_ids, prizes 
       FROM sweepstakes 
       WHERE sweepstakes_num = $1 
       FOR UPDATE`,
      [sweepstakesNum]
    )

    if (!sweepstakes) {
      throw new SweepstakesError(404, 'Sweepstakes not found')
    }

    if (new Date(sweepstakes.close_time) > new Date()) {
      throw new SweepstakesError(400, 'Sweepstakes has not closed yet')
    }

    if (
      sweepstakes.winning_ticket_ids &&
      sweepstakes.winning_ticket_ids.length > 0
    ) {
      throw new SweepstakesError(400, 'Winners have already been selected')
    }

    const tickets = await tx.manyOrNone<{
      id: string
      user_id: string
      num_tickets: string
    }>(
      `SELECT id, user_id, num_tickets 
       FROM sweepstakes_tickets 
       WHERE sweepstakes_num = $1 
       ORDER BY created_time ASC`,
      [sweepstakesNum]
    )

    if (tickets.length === 0) {
      throw new SweepstakesError(400, 'No tickets have been purchased')
    }

    let totalTickets = 0
    const ticketRanges: {
      id: string
      userId: string
      start: number
      end: number
    }[] = []

    for (const ticket of tickets) {
      const numTickets = parseFloat(ticket.num_tickets)
      ticketRanges.push({
        id: ticket.id,
        userId: ticket.user_id,
        start: totalTickets,
        end: totalTickets + numTickets,
      })
      totalTickets += numTickets
    }

    const closeTimeSeconds = Math.floor(
      new Date(sweepstakes.close_time).getTime() / 1000
    )
    const block = await getFirstBlockAfter(closeTimeSeconds)
    const blockHash = block.id
    const numWinners = getTotalWinnerCount(sweepstakes.prizes)
    const winningTicketIds: string[] = []
    const winners: {
      rank: number
      label: string
      prizeUsdc: number
      ticketId: string
      userId: string
    }[] = []
    const wonUserIds = new Set<string>()

    for (let rank = 1; rank <= numWinners; rank++) {
      let remainingTotal = 0
      const remainingRanges: typeof ticketRanges = []

      for (const range of ticketRanges) {
        if (!wonUserIds.has(range.userId)) {
          remainingRanges.push({
            ...range,
            start: remainingTotal,
            end: remainingTotal + (range.end - range.start),
          })
          remainingTotal += range.end - range.start
        }
      }

      if (remainingRanges.length === 0 || remainingTotal === 0) {
        log(
          `Sweepstakes ${sweepstakesNum}: Only ${winners.length} winners selected (not enough unique users for ${numWinners} prizes)`
        )
        break
      }

      const hash = createHash('sha256')
        .update(blockHash)
        .update(Buffer.from([rank]))
        .digest()

      const randomValue =
        Number(hash.readBigUInt64BE(0)) / Number(BigInt(2) ** BigInt(64))
      const winningTicketNumber = randomValue * remainingTotal
      let winningTicket: (typeof remainingRanges)[0] | null = null

      for (const range of remainingRanges) {
        if (
          winningTicketNumber >= range.start &&
          winningTicketNumber < range.end
        ) {
          winningTicket = range
          break
        }
      }

      if (!winningTicket) {
        winningTicket = remainingRanges[remainingRanges.length - 1]
      }

      wonUserIds.add(winningTicket.userId)
      winningTicketIds.push(winningTicket.id)

      const prize = getPrizeForRank(sweepstakes.prizes, rank)

      winners.push({
        rank,
        label: prize?.label ?? `${rank}${getOrdinalSuffix(rank)}`,
        prizeUsdc: prize?.amountUsdc ?? 0,
        ticketId: winningTicket.id,
        userId: winningTicket.userId,
      })
    }

    await tx.none(
      `UPDATE sweepstakes 
       SET winning_ticket_ids = $1, nonce = $2
       WHERE sweepstakes_num = $3`,
      [winningTicketIds, blockHash, sweepstakesNum]
    )

    if (winners.length > 0) {
      const notifications: Notification[] = winners.map((winner) => {
        const data: PrizeWinnerData = {
          rank: winner.rank,
          prizeLabel: winner.label,
          prizeAmountUsdc: winner.prizeUsdc,
          sweepstakesNum,
        }

        return {
          id: nanoid(6),
          userId: winner.userId,
          reason: 'prize_winner' as const,
          createdTime: Date.now(),
          isSeen: false,
          sourceId: `sweepstakes-${sweepstakesNum}-winner-${winner.rank}`,
          sourceType: 'prize_winner' as const,
          sourceUserName: MANIFOLD_USER_NAME,
          sourceUserUsername: MANIFOLD_USER_USERNAME,
          sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
          sourceText: `$${winner.prizeUsdc}`,
          sourceSlug: '/prize',
          sourceTitle: `You won ${winner.label} place ($${winner.prizeUsdc} USDC) in the Prize Drawing!`,
          data,
        }
      })

      await bulkInsertNotifications(notifications, tx)
    }

    return { winners, blockHash, blockHeight: block.height }
  })
}

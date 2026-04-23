import { toLiteMarket } from 'common/api/market-types'
import { PERPS_ENABLED } from 'common/envs/constants'
import {
  Contract,
  Perp,
  PerpMechanism,
  nativeContractColumnsArray,
} from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'
import { randomString } from 'common/util/random'
import { slugify } from 'common/util/slugify'
import { camelCase, first } from 'lodash'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { anythingToRichText } from 'shared/tiptap'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { broadcastNewContract } from 'shared/websockets/helpers'
import { convertUser } from 'common/supabase/users'
import { getUser, htmlToRichText } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const createPerp: APIHandler<'create-perp'> = async (body, auth) => {
  if (!PERPS_ENABLED) throw new APIError(403, 'Perps are disabled')
  throwErrorIfNotAdmin(auth.uid)

  const {
    question,
    description,
    descriptionHtml,
    descriptionMarkdown,
    descriptionJson,
    visibility = 'public',
    oracleFeedId,
    maxLeverage,
    maxFundingRate,
    fundingSensitivity,
    maxOraclePriceAgeMs,
    subsidyLong,
    subsidyShort,
  } = body

  const totalSubsidy = subsidyLong + subsidyShort
  if (totalSubsidy < 1)
    throw new APIError(400, 'Total subsidy must be at least 1 mana')

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(404, 'User not found')
  if (user.balance < totalSubsidy)
    throw new APIError(403, `Balance must be at least ${totalSubsidy}.`)

  const pg = createSupabaseDirectClient()

  // Implicit feed existence check: at least one oracle_prices row must exist.
  const oracle = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [oracleFeedId]
  )
  if (!oracle)
    throw new APIError(
      400,
      `No oracle price data for feed "${oracleFeedId}" — have an internal service write to oracle_prices first.`
    )

  const proposedSlug = slugify(question)

  return await pg.tx(async (tx) => {
    const collision = await tx.oneOrNone<{ id: string }>(
      `select 1 as id from contracts where slug = $1 limit 1`,
      [proposedSlug]
    )
    const slug = collision ? `${proposedSlug}-${randomString(4)}` : proposedSlug

    const now = Date.now()
    const contractId = randomString(12)

    const perp: Perp & PerpMechanism = {
      outcomeType: 'PERP',
      mechanism: 'perp',
      maxLeverage,
      maxFundingRate,
      fundingSensitivity,
      maxOraclePriceAgeMs,
      poolLong: subsidyLong,
      poolShort: subsidyShort,
      initialSubsidy: totalSubsidy,
      oracleFeedId,
      oraclePrice: Number(oracle.price),
      oraclePriceTime: new Date(oracle.ts).getTime(),
    }

    const contract: Contract = removeUndefinedProps({
      id: contractId,
      slug,
      creatorId: user.id,
      creatorName: user.name,
      creatorUsername: user.username,
      creatorAvatarUrl: user.avatarUrl,
      creatorCreatedTime: user.createdTime,
      question,
      description:
        typeof description !== 'string' && description
          ? description
          : anythingToRichText({
              raw: description,
              html: descriptionHtml,
              markdown: descriptionMarkdown,
              jsonString: descriptionJson,
            }) ?? htmlToRichText(`<p> </p>`),
      visibility,
      createdTime: now,
      lastUpdatedTime: now,
      isResolved: false,
      token: 'MANA',
      volume: 0,
      volume24Hours: 0,
      elasticity: 0,
      collectedFees: {
        creatorFee: 0,
        liquidityFee: 0,
        platformFee: 0,
      },
      uniqueBettorCount: 0,
      uniqueBettorCountDay: 0,
      importanceScore: 0,
      homePageScoreAdjustment: 0,
      dailyScore: 0,
      freshnessScore: 0,
      conversionScore: 0,
      viewCount: 0,
      boosted: false,
      ...perp,
    } as unknown as Contract)

    const nativeColumns = nativeContractColumnsArray.filter((c) => c !== 'data')
    const nativeValues = nativeColumns.map((column) => {
      const camelKey = camelCase(column) as keyof Contract
      return camelKey in contract ? (contract as any)[camelKey] : null
    })
    const nativeKeys = nativeColumns.map(camelCase)
    const contractDataToInsert = Object.fromEntries(
      Object.entries(contract).filter(([k]) => !nativeKeys.includes(k))
    )

    const contractQuery = pgp.as.format(
      `insert into contracts (id, data, ${nativeColumns.join(',')})
       values ($1, $2, ${nativeValues.map((_, i) => `$${i + 3}`)})`,
      [contract.id, JSON.stringify(contractDataToInsert), ...nativeValues]
    )
    await tx.none(contractQuery)

    // Creator pays the subsidy into the contract pools.
    await runTxnOutsideBetQueue(tx, {
      fromId: user.id,
      fromType: 'USER',
      toId: contract.id,
      toType: 'CONTRACT',
      amount: totalSubsidy,
      token: 'M$',
      category: 'CREATE_CONTRACT_ANTE',
    })

    const userRow = await tx.oneOrNone(
      `select * from users where id = $1 limit 1`,
      [user.id]
    )
    const refreshedUser = first(userRow ? [userRow] : [])
      ? convertUser(userRow)
      : user
    broadcastNewContract(contract, refreshedUser)

    return toLiteMarket(contract)
  })
}

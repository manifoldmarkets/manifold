import { z } from 'zod'
import {
  Group,
  MAX_ID_LENGTH,
  MySearchGroupShape,
  LiteGroup,
  SearchGroupParams,
  SearchGroupShape,
  Topic,
} from 'common/group'
import {
  createMarketProps,
  resolveMarketProps,
  type LiteMarket,
  FullMarket,
  updateMarketProps,
} from './market-types'
import type { ContractComment } from 'common/comment'
import { CandidateBet } from 'common/new-bet'
import type { Bet, LimitBet } from 'common/bet'
import { contentSchema } from 'common/api/zod-types'
import { Lover } from 'common/love/lover'
import { CPMMMultiContract, Contract } from 'common/contract'
import { CompatibilityScore } from 'common/love/compatibility-score'
import type { Txn, ManaPayTxn } from 'common/txn'
import { LiquidityProvision } from 'common/liquidity-provision'
import { LiteUser } from './user-types'
import { League } from 'common/leagues'
import { searchProps } from './market-search-types'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { type LinkPreview } from 'common/link-preview'
import { Headline } from 'common/news'
import { Row } from 'common/supabase/utils'
import { LikeData, ShipData } from './love-types'
import { AnyBalanceChangeType } from 'common/balance-change'
import { PrivateUser } from 'common/user'
import { notification_preference } from 'common/user-notification-preferences'

export const marketCacheStrategy = 's-maxage=15, stale-while-revalidate=45'

type APIGenericSchema = {
  // GET is for retrieval, POST is to mutate something, PUT is idempotent mutation (can be repeated safely)
  method: 'GET' | 'POST' | 'PUT'
  //private APIs can only be called from manifold. undocumented endpoints can change or be deleted at any time!
  visibility: 'public' | 'undocumented' | 'private'
  // whether the endpoint requires authentication
  authed: boolean
  // zod schema for the request body (or for params for GET requests)
  props: z.ZodType
  // note this has to be JSON serializable
  returns?: Record<string, any>
  // Cache-Control header. like, 'max-age=60'
  cache?: string
}

let _apiTypeCheck: { [x: string]: APIGenericSchema }
export const API = (_apiTypeCheck = {
  comment: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as ContractComment,
    props: z
      .object({
        contractId: z.string(),
        content: contentSchema.optional(),
        html: z.string().optional(),
        markdown: z.string().optional(),
        replyToCommentId: z.string().optional(),
        replyToAnswerId: z.string().optional(),
        replyToBetId: z.string().optional(),
      })
      .strict(),
  },
  'hide-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ commentPath: z.string() }).strict(),
  },
  'pin-comment': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({ commentPath: z.string() }).strict(),
  },
  comments: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'max-age=15, public',
    returns: [] as ContractComment[],
    props: z
      .object({
        contractId: z.string().optional(),
        contractSlug: z.string().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
        page: z.coerce.number().gte(0).default(0),
        userId: z.string().optional(),
        isPolitics: z.coerce.boolean().optional(),
      })
      .strict(),
  },
  bet: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as CandidateBet & { betId: string },
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().gte(1),
        replyToCommentId: z.string().optional(),
        limitProb: z.number().gte(0).lte(1).optional(),
        expiresAt: z.number().optional(),
        // Used for binary and new multiple choice contracts (cpmm-multi-1).
        outcome: z.enum(['YES', 'NO']).default('YES'),
        //Multi
        answerId: z.string().optional(),
      })
      .strict(),
  },
  'bet/cancel/:betId': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ betId: z.string() }).strict(),
    returns: {} as LimitBet,
  },
  // sell shares
  'market/:contractId/sell': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as CandidateBet & { betId: string },
    props: z.object({
      contractId: z.string(),
      shares: z.number().positive().optional(), // leave it out to sell all shares
      outcome: z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have
      answerId: z.string().optional(), // Required for multi binary markets
    }),
  },
  'sell-shares-dpm': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ contractId: z.string(), betId: z.string() }).strict(),
  },
  bets: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'max-age=15, public',
    returns: [] as Bet[],
    props: z
      .object({
        userId: z.string().optional(),
        username: z.string().optional(),
        contractId: z.string().optional(),
        contractSlug: z.string().optional(),
        // market: z.string().optional(), // deprecated, synonym for `contractSlug`
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
        before: z.string().optional(),
        after: z.string().optional(),
        kinds: z.string().optional(),
        order: z.enum(['asc', 'desc']).optional(),
      })
      .strict(),
  },
  // deprecated. use /bets?username= instead
  'user/:username/bets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'max-age=15, public',
    returns: [] as Bet[],
    props: z
      .object({
        username: z.string(),
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
      })
      .strict(),
  },
  'group/:slug': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'no-cache',
    returns: {} as Group,
    props: z.object({ slug: z.string() }),
  },
  'group/by-id/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'no-cache',
    returns: {} as Group,
    props: z.object({ id: z.string() }).strict(),
  },
  'group/:slug/block': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ slug: z.string() }).strict(),
  },
  'group/:slug/unblock': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ slug: z.string() }).strict(),
  },
  // deprecated. use /markets?groupId= instead
  'group/by-id/:id/markets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: marketCacheStrategy,
    returns: [] as LiteMarket[],
    props: z
      .object({
        id: z.string(),
        limit: z.coerce.number().gte(0).lte(1000).default(500),
      })
      .strict(),
  },
  groups: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'max-age=60',
    returns: [] as Group[],
    props: z
      .object({
        availableToUserId: z.string().optional(),
        beforeTime: z.coerce.number().int().optional(),
      })
      .strict(),
  },
  'market/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket | FullMarket,
    cache: marketCacheStrategy,
    props: z.object({ id: z.string(), lite: z.boolean().optional() }),
  },
  // deprecated. use /market/:id?lite=true instead
  'market/:id/lite': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket,
    cache: marketCacheStrategy,
    props: z.object({ id: z.string() }),
  },
  'slug/:slug': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket | FullMarket,
    cache: marketCacheStrategy,
    props: z.object({ slug: z.string(), lite: z.boolean().optional() }),
  },
  market: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as LiteMarket,
    props: createMarketProps,
  },
  'market/:contractId/update': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: updateMarketProps,
  },
  // deprecated. remove after a few days
  'update-market': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: updateMarketProps,
  },
  'market/:contractId/close': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    // returns: {} as LiteMarket,
    props: z
      .object({
        contractId: z.string(),
        closeTime: z.number().int().nonnegative().optional(),
      })
      .strict(),
  },
  'market/:contractId/resolve': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: resolveMarketProps,
  },
  'market/:contractId/add-liquidity': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as LiquidityProvision,
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().int().gt(0).finite(),
      })
      .strict(),
  },
  'market/:contractId/add-bounty': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as Txn,
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().gt(0).int().finite(),
      })
      .strict(),
  },
  'market/:contractId/award-bounty': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as Txn,
    props: z
      .object({
        contractId: z.string(),
        commentId: z.string(),
        amount: z.number().gt(0).int().finite(),
      })
      .strict(),
  },
  'market/:contractId/group': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        contractId: z.string(),
        groupId: z.string(),
        remove: z.boolean().default(false),
      })
      .strict(),
  },
  'market/:contractId/answer': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { newAnswerId: string },
    props: z
      .object({
        contractId: z.string().max(MAX_ANSWER_LENGTH),
        text: z.string().min(1).max(MAX_ANSWER_LENGTH),
      })
      .strict(),
  },
  'market/:contractId/block': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ contractId: z.string() }).strict(),
  },
  'market/:contractId/unblock': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ contractId: z.string() }).strict(),
  },
  leagues: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'max-age=60',
    returns: [] as League[],
    props: z
      .object({
        userId: z.string().optional(),
        cohort: z.string().optional(),
        season: z.coerce.number().optional(),
      })
      .strict(),
  },
  markets: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: marketCacheStrategy,
    returns: [] as LiteMarket[],
    props: z
      .object({
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        sort: z
          .enum([
            'created-time',
            'updated-time',
            'last-bet-time',
            'last-comment-time',
          ])
          .optional(),
        order: z.enum(['asc', 'desc']).optional(),
        before: z.string().optional(),
        userId: z.string().optional(),
        groupId: z.string().optional(),
      })
      .strict(),
  },
  'search-markets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: marketCacheStrategy,
    returns: [] as LiteMarket[],
    props: searchProps,
  },
  'search-markets-full': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: marketCacheStrategy,
    returns: [] as Contract[],
    props: searchProps,
  },
  managram: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        amount: z.number().finite(),
        toIds: z.array(z.string()),
        message: z.string(),
        groupId: z.string().max(MAX_ID_LENGTH).optional(),
      })
      .strict(),
  },
  manalink: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { slug: string },
    props: z
      .object({
        amount: z.number().positive().finite().safe(),
        expiresTime: z.number().optional(),
        maxUses: z.number().optional(),
        message: z.string().optional(),
      })
      .strict(),
  },
  'request-loan': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({}),
    returns: {} as { payout: number },
  },
  managrams: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: [] as ManaPayTxn[],
    props: z
      .object({
        toId: z.string().optional(),
        fromId: z.string().optional(),
        limit: z.coerce.number().gte(0).lte(100).default(100),
        before: z.string().optional(),
        after: z.string().optional(),
      })
      .strict(),
  },
  'market/:id/positions': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 's-maxage=120, stale-while-revalidate=150',
    returns: {} as any,
    props: z
      .object({
        id: z.string(),
        userId: z.string().optional(),
        top: z.undefined().or(z.coerce.number()),
        bottom: z.undefined().or(z.coerce.number()),
        order: z.enum(['shares', 'profit']).optional(),
      })
      .strict(),
  },
  me: {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({}),
    returns: {} as LiteUser,
  },
  'me/private': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({}),
    returns: {} as PrivateUser,
  },
  'update-private-user': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z
      .object({
        email: z.string().email().optional(),
        apiKey: z.string().optional(),
        pushToken: z.string().optional(),
        rejectedPushNotificationsOn: z.number().optional(),
        interestedInPushNotifications: z.boolean().or(z.null()).optional(),
        lastPromptedToEnablePushNotifications: z.number().optional(),
        hasSeenAppBannerInNotificationsOn: z.number().optional(),
        installedAppPlatforms: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'delete-account': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      username: z.string(), // just checking - are you sure?
    }),
  },
  'user/:username': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'no-cache',
    returns: {} as LiteUser,
    props: z.object({ username: z.string() }),
  },
  'user/by-id/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'no-cache',
    returns: {} as LiteUser,
    props: z.object({ id: z.string() }).strict(),
  },
  users: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 's-maxage=45, stale-while-revalidate=45',
    returns: [] as LiteUser[],
    props: z
      .object({
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        before: z.string().optional(),
      })
      .strict(),
  },
  'search-users': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 's-maxage=45, stale-while-revalidate=45',
    returns: [] as LiteUser[],
    props: z
      .object({
        term: z.string(),
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        page: z.coerce.number().gte(0).default(0),
      })
      .strict(),
  },
  'block-user': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ userId: z.string() }).strict(),
  },
  'unblock-user': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ userId: z.string() }).strict(),
  },
  'save-twitch': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        twitchInfo: z.object({
          twitchName: z.string().optional(),
          controlToken: z.string().optional(),
          botEnabled: z.boolean().optional(),
          needsRelinking: z.boolean().optional(),
        }),
      })
      .strict(),
  },
  'set-push-token': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({ pushToken: z.string() }).strict(),
  },
  'update-notif-settings': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      type: z.string() as z.ZodType<notification_preference>,
      medium: z.enum(['email', 'browser', 'mobile']),
      enabled: z.boolean(),
    }),
  },
  headlines: {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    returns: [] as Headline[],
    props: z.object({}),
  },
  'politics-headlines': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    returns: [] as Headline[],
    props: z.object({}),
  },
  'set-news': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: true },
    props: z.object({
      dashboardIds: z.array(z.string()),
      isPolitics: z.boolean().optional(),
    }),
  },
  react: {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      contentId: z.string(),
      contentType: z.enum(['comment', 'contract']),
      remove: z.boolean().optional(),
    }),
  },
  'compatible-lovers': {
    method: 'GET',
    visibility: 'private',
    authed: false,
    props: z.object({ userId: z.string() }),
    returns: {} as {
      lover: Lover
      matchedLovers: Lover[]
      compatibleLovers: Lover[]
      loverCompatibilityScores: {
        [userId: string]: CompatibilityScore
      }
      loverContracts: CPMMMultiContract[]
    },
  },
  post: {
    method: 'POST',
    visibility: 'private',
    authed: true,
    returns: {} as ContractComment,
    props: z
      .object({
        contractId: z.string(),
        betId: z.string().optional(),
        commentId: z.string().optional(),
        content: contentSchema.optional(),
      })
      .strict(),
  },
  'fetch-link-preview': {
    method: 'GET',
    visibility: 'private',
    authed: false,
    props: z.object({ url: z.string() }).strict(),
    cache: 'max-age=86400, stale-while-revalidate=86400',
    returns: {} as LinkPreview,
  },
  'remove-pinned-photo': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    returns: { success: true },
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
  },
  'get-related-markets': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    props: z.object({
      contractId: z.string(),
      limit: z.coerce.number().gte(0).lte(100),
      limitTopics: z.coerce.number().gte(0).lte(10),
      userId: z.string().optional(),
    }),
    returns: {} as {
      marketsFromEmbeddings: Contract[]
      marketsByTopicSlug: { [topicSlug: string]: Contract[] }
    },
  },
  'unlist-and-cancel-user-contracts': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      userId: z.string(),
    }),
  },
  'get-ad-analytics': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    props: z.object({
      contractId: z.string(),
    }),
    returns: {} as {
      uniqueViewers: number
      totalViews: number
      uniquePromotedViewers: number
      totalPromotedViews: number
      redeemCount: number
      isBoosted: boolean
      totalFunds: number
      adCreatedTime: string
    },
  },
  'get-compatibility-questions': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({}),
    returns: {} as {
      status: 'success'
      questions: (Row<'love_questions'> & {
        answer_count: number
        score: number
      })[]
    },
  },
  'like-lover': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z.object({
      targetUserId: z.string(),
      remove: z.boolean().optional(),
    }),
    returns: {} as {
      status: 'success'
    },
  },
  'ship-lovers': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z.object({
      targetUserId1: z.string(),
      targetUserId2: z.string(),
      remove: z.boolean().optional(),
    }),
    returns: {} as {
      status: 'success'
    },
  },
  'request-signup-bonus': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { bonus: number },
    props: z.object({}),
  },
  'get-likes-and-ships': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      status: 'success'
      likesReceived: LikeData[]
      likesGiven: LikeData[]
      ships: ShipData[]
    },
  },
  'has-free-like': {
    method: 'GET',
    visibility: 'private',
    authed: true,
    props: z.object({}).strict(),
    returns: {} as {
      status: 'success'
      hasFreeLike: boolean
    },
  },
  'star-lover': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z.object({
      targetUserId: z.string(),
      remove: z.boolean().optional(),
    }),
    returns: {} as {
      status: 'success'
    },
  },
  'get-lovers': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({}).strict(),
    returns: {} as {
      status: 'success'
      lovers: Lover[]
    },
  },
  'get-lover-answers': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({ userId: z.string() }).strict(),
    returns: {} as {
      status: 'success'
      answers: Row<'love_compatibility_answers'>[]
    },
  },
  'update-user-embedding': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({}),
  },
  'search-groups': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    // Is there a way to infer return { lite:[] as LiteGroup[] } if type is 'lite'?
    returns: {
      full: [] as Group[],
      lite: [] as LiteGroup[],
    },
    props: SearchGroupParams(SearchGroupShape),
  },
  'search-my-groups': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: {
      full: [] as Group[],
      lite: [] as LiteGroup[],
    },
    props: SearchGroupParams(MySearchGroupShape),
  },
  'get-groups-with-top-contracts': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: [] as { topic: Topic; contracts: Contract[] }[],
    props: z.object({}),
  },
  'get-balance-changes': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    returns: [] as AnyBalanceChangeType[],
    props: z
      .object({
        after: z.coerce.number(),
        userId: z.string(),
      })
      .strict(),
  },
  'create-your-love-market': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z.object({}),
    returns: {} as {
      status: 'success'
      contract: CPMMMultiContract
    },
  },
  'get-love-market': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      status: 'success'
      contract: CPMMMultiContract | null
      lovers: Lover[]
      mutuallyMessagedUserIds: string[]
    },
  },
  'get-love-markets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({}).strict(),
    returns: {} as {
      status: 'success'
      contracts: CPMMMultiContract[]
      creatorLovers: Lover[]
      lovers: Lover[]
      creatorMutuallyMessagedUserIds: { [creatorId: string]: string[] }
      creatorCompatibilityScores: {
        [creatorId: string]: { [loverId: string]: CompatibilityScore }
      }
    },
  },
} as const)

export type APIPath = keyof typeof API
export type APISchema<N extends APIPath> = (typeof API)[N]

export type APIParams<N extends APIPath> = z.input<APISchema<N>['props']>
export type ValidatedAPIParams<N extends APIPath> = z.output<
  APISchema<N>['props']
>

export type APIResponse<N extends APIPath> = APISchema<N> extends {
  returns: Record<string, any>
}
  ? APISchema<N>['returns']
  : void

export type APIResponseOptionalContinue<N extends APIPath> =
  | { continue: () => Promise<void>; result: APIResponse<N> }
  | APIResponse<N>

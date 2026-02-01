import { MAX_ANSWER_LENGTH, type Answer } from 'common/answer'
import { coerceBoolean, contentSchema } from 'common/api/zod-types'
import { AnyBalanceChangeType } from 'common/balance-change'
import type { Bet, LimitBet } from 'common/bet'
import { ChatMessage, PrivateChatMessage } from 'common/chat-message'
import {
  Comment,
  CommentWithTotalReplies,
  MAX_COMMENT_LENGTH,
  PostComment,
  type ContractComment,
} from 'common/comment'
import { AIGeneratedMarket, Contract, MarketContract } from 'common/contract'
import { Dashboard } from 'common/dashboard'
import { SWEEPS_MIN_BET } from 'common/economy'
import {
  Group,
  LiteGroup,
  MAX_ID_LENGTH,
  MySearchGroupShape,
  SearchGroupParams,
  SearchGroupShape,
  Topic,
} from 'common/group'
import { League } from 'common/leagues'
import { type LinkPreview } from 'common/link-preview'
import { LiquidityProvision } from 'common/liquidity-provision'
import { CandidateBet } from 'common/new-bet'
import { Headline } from 'common/news'
import { PERIODS } from 'common/period'
import {
  LivePortfolioMetrics,
  PortfolioMetrics,
} from 'common/portfolio-metrics'
import { Repost } from 'common/repost'
import { ManaSupply } from 'common/stats'
import { Row } from 'common/supabase/utils'
import type { ManaPayTxn, Txn } from 'common/txn'
import { z } from 'zod'
import { ModReport } from '../mod-report'
import { PrivateUser, User, UserBan } from '../user'
import { searchProps } from './market-search-types'
import {
  FullMarket,
  createMarketProps,
  resolveMarketProps,
  updateMarketProps,
  type LiteMarket,
} from './market-types'
import { DisplayUser, FullUser } from './user-types'

import { ContractMetric } from 'common/contract-metric'
import {
  CheckoutSession,
  GIDXDocument,
  GPSProps,
  PaymentDetail,
  PendingCashoutStatusData,
  cashoutParams,
  cashoutRequestParams,
  checkoutParams,
  verificationParams,
} from 'common/gidx/gidx'
import { Notification } from 'common/notification'
import { RegistrationReturnType } from 'common/reason-codes'
import { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { notification_preference } from 'common/user-notification-preferences'

import { JSONContent } from '@tiptap/core'
import { RanksType } from 'common/achievements'
import { MarketDraft } from 'common/drafts'
import { Reaction } from 'common/reaction'
import { ShopItem } from 'common/shop/items'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { Task, TaskCategory } from 'common/todo'
import { TopLevelPost } from 'common/top-level-post'
import { UserEntitlement } from 'common/shop/types'
import { YEAR_MS } from 'common/util/time'
import { Dictionary } from 'lodash'
// mqp: very unscientific, just balancing our willingness to accept load
// with user willingness to put up with stale data
export const DEFAULT_CACHE_STRATEGY =
  'public, max-age=5, stale-while-revalidate=10'
// Light cache to prevent accidental rapid-fire requests from hitting the server fresh every time
export const LIGHT_CACHE_STRATEGY =
  'public, max-age=1, stale-while-revalidate=0'
const MAX_EXPIRES_AT = 1_000 * YEAR_MS

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
  // whether the endpoint should prefer authentication even if not required
  preferAuth?: boolean
}

let _apiTypeCheck: { [x: string]: APIGenericSchema }
export const API = (_apiTypeCheck = {
  'refresh-all-clients': {
    method: 'POST',
    visibility: 'public',
    props: z.object({ message: z.string().optional() }),
    authed: true,
  },
  'toggle-system-trading-status': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        token: z.enum(['MANA', 'CASH', 'LOAN']),
      })
      .strict(),
    returns: {} as { status: boolean },
  },
  'recover-user': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
        email: z.string().optional(), // Optional manual email override
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'get-user-info': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      supabaseEmail?: string
      oldEmail?: string
      firebaseEmail?: string
      initialDeviceToken?: string
      initialIpAddress?: string
    },
  },
  'admin-delete-user': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'admin-search-users-by-email': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        email: z.string(),
        limit: z.coerce.number().gte(1).lte(100).default(10),
      })
      .strict(),
    returns: [] as Array<{
      user: FullUser
      matchedEmail: string
      matchedOnOldEmail: boolean
    }>,
  },
  'anonymize-user': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as { success: boolean; newUsername: string; newName: string },
  },
  'admin-get-related-users': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      userId: string
      targetCreatedTime?: number
      matches: Array<{
        visibleUser: FullUser
        matchReasons: (
          | 'ip'
          | 'deviceToken'
          | 'referrer'
          | 'referee'
          | 'managram'
        )[]
        netManagramAmount?: number
        bans: UserBan[]
      }>
    },
  },
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

  'follow-contract': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: true },
    props: z
      .object({
        contractId: z.string(),
        follow: z.boolean(),
      })
      .strict(),
  },
  'get-contract': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as Contract,
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
  },
  'answer/:answerId': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as Answer,
    props: z.object({ answerId: z.string() }).strict(),
  },
  'market/:contractId/answers': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as Answer[],
    props: z.object({ contractId: z.string() }).strict(),
  },
  'hide-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        commentPath: z.string(),
        action: z.enum(['hide', 'delete']).optional().default('hide'),
      })
      .strict(),
  },
  'edit-comment': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        contractId: z.string(),
        commentId: z.string(),
        content: contentSchema.optional(),
        html: z.string().optional(),
        markdown: z.string().optional(),
      })
      .strict(),
  },
  'leave-review': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        marketId: z.string(),
        review: contentSchema.optional(),
        rating: z.number().gte(0).lte(5).int(),
      })
      .strict(),
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
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as ContractComment[],
    props: z
      .object({
        contractId: z.string().optional(),
        contractSlug: z.string().optional(),
        afterTime: z.coerce.number().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
        page: z.coerce.number().gte(0).default(0),
        userId: z.string().optional(),
        order: z.enum(['likes', 'newest', 'oldest']).optional(),
        isPolitics: coerceBoolean.optional(),
      })
      .strict(),
  },
  'user-comments': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as Comment[],
    props: z
      .object({
        afterTime: z.coerce.number().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
        page: z.coerce.number().gte(0).default(0),
        userId: z.string(),
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
        amount: z.number().gte(SWEEPS_MIN_BET),
        replyToCommentId: z.string().optional(),
        limitProb: z.number().gte(0.01).lte(0.99).optional(),
        expiresMillisAfter: z.number().lt(MAX_EXPIRES_AT).optional(),
        silent: z.boolean().optional(),
        expiresAt: z.number().lt(MAX_EXPIRES_AT).optional(),
        // Used for binary and new multiple choice contracts (cpmm-multi-1).
        outcome: z.enum(['YES', 'NO']).default('YES'),
        //Multi
        answerId: z.string().optional(),
        dryRun: z.boolean().optional(),
        deps: z.array(z.string()).optional(),
        deterministic: z.boolean().optional(),
      })
      .strict(),
  },
  createuser: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { user: User; privateUser: PrivateUser },
    props: z
      .object({
        deviceToken: z.string().optional(),
        adminToken: z.string().optional(),
        visitedContractIds: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'multi-bet': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: [] as (CandidateBet & { betId: string })[],
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().gte(1),
        limitProb: z.number().gte(0).lte(1).optional(),
        expiresAt: z.number().lt(MAX_EXPIRES_AT).optional(),
        answerIds: z.array(z.string()).min(1),
        deterministic: z.boolean().optional(),
      })
      .strict(),
  },
  'multi-sell': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: [] as (CandidateBet & { betId: string })[],
    props: z
      .object({
        contractId: z.string(),
        answerIds: z.array(z.string()).min(1),
        deterministic: z.boolean().optional(),
      })
      .strict(),
  },
  leaderboard: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as { userId: string; score: number }[],
    props: z
      .object({
        groupId: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(50),
        token: z.enum(['MANA', 'CASH']).default('MANA'),
        kind: z.enum(['creator', 'profit', 'loss', 'volume', 'referral']),
      })
      .strict(),
  },
  'verify-phone-number': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { status: string },
    props: z
      .object({
        phoneNumber: z.string(),
        code: z.string(),
      })
      .strict(),
  },
  'request-otp': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { status: string },
    props: z
      .object({
        phoneNumber: z.string(),
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
    props: z
      .object({
        contractId: z.string(),
        shares: z.number().positive().optional(), // leave it out to sell all shares
        outcome: z.enum(['YES', 'NO']),
        answerId: z.string().optional(), // Required for multi binary markets
        deterministic: z.boolean().optional(),
        deps: z.array(z.string()).optional(),
        sellForUserId: z.string().optional(), // Admin-only: sell for another user
      })
      .strict(),
  },
  'get-user-limit-orders-with-contracts': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      bets: LimitBet[]
      contracts: MarketContract[]
    },
    props: z
      .object({
        userId: z.string(),
        count: z.coerce.number().lte(5000),
        includeExpired: coerceBoolean.optional().default(false),
        includeCancelled: coerceBoolean.optional().default(false),
        includeFilled: coerceBoolean.optional().default(false),
      })
      .strict(),
  },
  'get-interesting-groups-from-views': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as (Group & { hasBet: boolean })[],
    props: z
      .object({
        userId: z.string(),
        contractIds: z.array(z.string()).optional(),
      })
      .strict(),
  },
  bets: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as Bet[],
    props: z
      .object({
        id: z.string().optional(),
        userId: z.string().optional(),
        username: z.string().optional(),
        contractId: z.string().or(z.array(z.string())).optional(),
        contractSlug: z.string().optional(),
        answerId: z.string().optional(),
        // market: z.string().optional(), // deprecated, synonym for `contractSlug`
        limit: z.coerce
          .number()
          .gte(0)
          .lte(50000)
          .default(NON_POINTS_BETS_LIMIT),
        before: z.string().optional(),
        after: z.string().optional(),
        beforeTime: z.coerce.number().optional(),
        afterTime: z.coerce.number().optional(),
        order: z.enum(['asc', 'desc']).optional(),
        kinds: z.enum(['open-limit']).optional(),
        minAmount: z.coerce.number().positive().optional(),
        // undocumented fields. idk what a good api interface would be
        filterRedemptions: coerceBoolean.optional(),
        includeZeroShareRedemptions: coerceBoolean.optional(),
        commentRepliesOnly: coerceBoolean.optional(),
        count: coerceBoolean.optional(),
        points: coerceBoolean.optional(),
      })
      .strict(),
  },
  'bet-points': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: 'public, max-age=86400, stale-while-revalidate=3600',
    returns: [] as Bet[],
    props: z
      .object({
        contractId: z.string(),
        answerId: z.string().optional(),
        limit: z.coerce.number().gte(0).lte(50000).default(5000),
        beforeTime: z.coerce.number(),
        afterTime: z.coerce.number(),
        filterRedemptions: coerceBoolean.optional(),
        includeZeroShareRedemptions: coerceBoolean.optional(),
      })
      .strict(),
  },
  'unique-bet-group-count': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as { count: number },
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
  },
  'get-daily-changed-metrics-and-contracts': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    cache: 'public, max-age=900, stale-while-revalidate=90', // 15 minute cache
    props: z
      .object({
        limit: z.coerce.number(),
        userId: z.string(),
        balance: z.coerce.number(),
      })
      .strict(),
    returns: {} as {
      manaMetrics: ContractMetric[]
      contracts: MarketContract[]
      manaProfit: number
      manaInvestmentValue: number
      balance: number
    },
  },
  // deprecated. use /bets?username= instead
  'user/:username/bets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
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
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as Group,
    props: z.object({ slug: z.string() }),
  },
  'group/:slug/groups': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as { above: LiteGroup[]; below: LiteGroup[] },
    props: z.object({ slug: z.string() }).strict(),
  },
  'group/:slug/dashboards': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as {
      id: string
      title: string
      slug: string
      creatorId: string
    }[],
    props: z.object({ slug: z.string() }).strict(),
  },
  'group/by-id/:id/groups': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as { above: LiteGroup[]; below: LiteGroup[] },
    props: z.object({ id: z.string() }).strict(),
  },
  'group/by-id/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as Group,
    props: z.object({ id: z.string() }).strict(),
  },
  // deprecated. use /markets?groupId= instead
  'group/by-id/:id/markets': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as LiteMarket[],
    props: z
      .object({
        id: z.string(),
        limit: z.coerce.number().gte(0).lte(1000).default(500),
      })
      .strict(),
  },
  'group/:slug/delete': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ slug: z.string() }),
  },
  'group/by-id/:id/delete': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ id: z.string() }),
  },
  'group/:slug/block': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ slug: z.string() }),
  },
  'group/:slug/unblock': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ slug: z.string() }).strict(),
  },
  'group/by-id/:topId/group/:bottomId': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        topId: z.string(),
        bottomId: z.string(),
        remove: z.boolean().optional(),
      })
      .strict(),
    returns: {} as { status: 'success' },
  },
  groups: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as Group[],
    props: z
      .object({
        availableToUserId: z.string().optional(),
        beforeTime: z.coerce.number().int().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(500),
      })
      .strict(),
  },
  'market/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket | FullMarket,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z.object({ id: z.string(), lite: coerceBoolean.optional() }),
  },
  'market/:id/prob': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      prob?: number
      answerProbs?: { [answerId: string]: number }
    },
    props: z.object({ id: z.string() }).strict(),
  },
  'market-probs': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      [contractId: string]: {
        prob?: number
        answerProbs?: { [answerId: string]: number }
      }
    },
    props: z
      .object({
        ids: z.array(z.string()).max(100),
      })
      .strict(),
  },
  'markets-by-ids': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as Contract[],
    props: z
      .object({
        ids: z.array(z.string()).max(100),
      })
      .strict(),
  },
  // deprecated. use /market/:id?lite=true instead
  'market/:id/lite': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z.object({ id: z.string() }),
  },
  'slug/:slug': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket | FullMarket,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z.object({ slug: z.string(), lite: coerceBoolean.optional() }),
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
    returns: {} as { success: true },
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
    returns: {} as { message: string },
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
        amount: z.number().gt(0).finite(),
      })
      .strict(),
  },
  'market/:contractId/remove-liquidity': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as LiquidityProvision,
    props: z
      .object({
        contractId: z.string(),
        amount: z.number().gt(0).finite(),
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
        amount: z.number().gt(0).finite(),
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
        amount: z.number().gt(0).finite(),
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
    returns: {} as { success: true },
  },
  'market/:contractId/groups': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z.object({ contractId: z.string() }),
    returns: [] as LiteGroup[],
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
  unresolve: {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: true },
    props: z
      .object({
        contractId: z.string().max(MAX_ANSWER_LENGTH),
        answerId: z.string().max(MAX_ANSWER_LENGTH).optional(),
      })
      .strict(),
  },
  leagues: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
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
    cache: DEFAULT_CACHE_STRATEGY,
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
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as LiteMarket[],
    props: searchProps,
  },
  'search-markets-full': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    preferAuth: true,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as Contract[],
    props: searchProps,
  },
  'recent-markets': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true, // authed and no cache means users won't accidentally see results from other users
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
        message: z.string().max(MAX_COMMENT_LENGTH),
        groupId: z.string().max(MAX_ID_LENGTH).optional(),
        token: z.enum(['M$', 'CASH']).default('M$'),
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
        expiresTime: z.number().lt(MAX_EXPIRES_AT).optional(),
        maxUses: z.number().optional(),
        message: z.string().optional(),
      })
      .strict(),
  },
  donate: {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        amount: z.number().positive().finite().safe(),
        to: z.string(),
      })
      .strict(),
  },
  'convert-sp-to-mana': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ amount: z.number().positive().finite().safe() }).strict(),
  },
  'convert-cash-to-mana': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ amount: z.number().positive().finite().safe() }).strict(),
  },
  'request-loan': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      amount: z.number().positive(),
      contractId: z.string().optional(),
      answerId: z.string().optional(),
    }),
    returns: {} as {
      success: boolean
      amount: number
      distributed: Array<{
        contractId: string
        answerId: string | null
        loanAmount: number
      }>
    },
  },
  'repay-loan': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      amount: z.number().positive(),
      contractId: z.string().optional(),
      answerId: z.string().optional(),
    }),
    returns: {} as { repaid: number; remainingLoan: number },
  },
  'get-total-loan-amount': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({}),
    returns: {} as { totalOwed: number },
  },
  // deprecated. use /txns instead
  managrams: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as ManaPayTxn[],
    props: z
      .object({
        toId: z.string().optional(),
        fromId: z.string().optional(),
        limit: z.coerce.number().gte(0).lte(100).default(100),
        before: z.coerce.number().optional(),
        after: z.coerce.number().optional(),
      })
      .strict(),
  },
  'market/:id/positions': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as ContractMetric[],
    props: z
      .object({
        id: z.string(),
        userId: z.string().optional(),
        answerId: z.string().optional(),
        summaryOnly: z.boolean().optional(),
        top: z.undefined().or(z.coerce.number()),
        bottom: z.undefined().or(z.coerce.number()),
        order: z.enum(['shares', 'profit']).optional(),
      })
      .strict(),
  },
  'comment-threads': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z
      .object({
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100).default(10),
        page: z.coerce.number().gte(0).default(0),
      })
      .strict(),
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as {
      replyComments: ContractComment[]
      parentComments: ContractComment[]
    },
  },
  'comment-thread': {
    method: 'GET',
    cache: LIGHT_CACHE_STRATEGY,
    visibility: 'public',
    authed: false,
    props: z
      .object({
        contractId: z.string(),
        commentId: z.string(),
      })
      .strict(),
    returns: {} as {
      parentComment: ContractComment | null
      replyComments: ContractComment[]
      parentComments: ContractComment[]
      nextParentComments: ContractComment[]
      nextReplyComments: ContractComment[]
    },
  },
  me: {
    method: 'GET',
    visibility: 'public',
    authed: true,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z.object({}),
    returns: {} as FullUser,
  },
  'me/update': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      userId: z.string().optional(), // Admin-only: specify user to update
      name: z.string().trim().min(1).optional(),
      username: z.string().trim().min(1).optional(),
      avatarUrl: z.string().optional(),
      bio: z.string().optional(),
      website: z.string().optional(),
      twitterHandle: z.string().optional(),
      discordHandle: z.string().optional(),
      // settings
      optOutBetWarnings: z.boolean().optional(),
      isAdvancedTrader: z.boolean().optional(),
      //internal
      seenStreakModal: z.boolean().optional(),
      shouldShowWelcome: z.boolean().optional(),
      hasSeenContractFollowModal: z.boolean().optional(),
      hasSeenLoanModal: z.boolean().optional(),
    }),
    returns: {} as FullUser,
  },
  'me/delete': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      username: z.string(), // just so you're sure
    }),
  },
  'me/private': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({}),
    returns: {} as PrivateUser,
  },
  'me/private/update': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    props: z
      .object({
        email: z.string().email().optional(),
        apiKey: z.string().optional(),
        pushToken: z.string().optional(),
        rejectedPushNotificationsOn: z.number().optional(),
        lastPromptedToEnablePushNotifications: z.number().optional(),
        interestedInPushNotifications: z.boolean().optional(),
        hasSeenAppBannerInNotificationsOn: z.number().optional(),
        installedAppPlatforms: z.array(z.string()).optional(),
        paymentInfo: z.string().optional(),
        lastAppReviewTime: z.number().optional(),
      })
      .strict(),
  },
  'get-user-private-data': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({
      userId: z.string(),
    }),
    returns: {} as PrivateUser,
  },
  'user/:username': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as FullUser,
    props: z.object({ username: z.string() }).strict(),
  },
  'user/:username/lite': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as DisplayUser,
    props: z.object({ username: z.string() }).strict(),
  },
  'user/by-id/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    // Do not add a caching strategy here. New users need up-to-date data.
    returns: {} as FullUser,
    props: z.object({ id: z.string() }).strict(),
  },
  'user/by-id/:id/lite': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as DisplayUser,
    props: z.object({ id: z.string() }).strict(),
  },
  'users/by-id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as DisplayUser[],
    props: z.object({ ids: z.array(z.string()) }).strict(),
  },
  'users/by-id/balance': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as { id: string; balance: number }[],
    props: z.object({ ids: z.array(z.string()) }).strict(),
  },
  'user/by-id/:id/block': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ id: z.string() }).strict(),
  },
  'user/by-id/:id/unblock': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({ id: z.string() }).strict(),
  },
  users: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as FullUser[],
    props: z
      .object({
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        order: z.enum(['asc', 'desc']).optional().default('desc'),
        before: z.string().optional(),
      })
      .strict(),
  },
  'search-users': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as FullUser[],
    props: z
      .object({
        term: z.string(),
        limit: z.coerce.number().gte(0).lte(1000).default(500),
        page: z.coerce.number().gte(0).default(0),
      })
      .strict(),
  },
  'search-contract-positions': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as DisplayUser[],
    props: z
      .object({
        term: z.string(),
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100).default(10),
      })
      .strict(),
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
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as Headline[],
    props: z.object({
      slug: z.enum(['politics', 'ai', 'news']).optional(),
    }),
  },
  'politics-headlines': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as Headline[],
    props: z.object({}),
  },
  'set-news': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: true },
    props: z
      .object({
        dashboardIds: z.array(z.string()),
        endpoint: z.enum(['politics', 'ai', 'news']),
      })
      .strict(),
  },
  react: {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        contentId: z.string(),
        contentType: z.enum(['comment', 'contract', 'post']),
        commentParentType: z.enum(['post']).optional(),
        remove: z.boolean().optional(),
        reactionType: z.enum(['like', 'dislike']).optional().default('like'),
      })
      .strict(),
    returns: { success: true },
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
    cache: 'max-age=86400, stale-while-revalidate=86400',
    props: z.object({ url: z.string() }).strict(),
    returns: {} as LinkPreview,
  },
  'get-related-markets': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 'public, max-age=3600, stale-while-revalidate=10',
    props: z
      .object({
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100),
        userId: z.string().optional(),
        question: z.string().optional(),
        uniqueBettorCount: z.coerce.number().gte(0).optional(),
      })
      .strict(),
    returns: {} as {
      marketsFromEmbeddings: Contract[]
    },
  },
  'get-related-markets-by-group': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 'public, max-age=3600, stale-while-revalidate=10',
    returns: {} as {
      groupContracts: Contract[]
    },
    props: z
      .object({
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100),
        offset: z.coerce.number().gte(0),
      })
      .strict(),
  },
  'get-market-context': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 'public, max-age=3600, stale-while-revalidate=10',
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
    returns: {} as {
      context: JSONContent | undefined
    },
  },
  'ban-user': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
        unban: z.boolean().optional(),
        unbanTime: z.number().optional(),
        bans: z
          .object({
            posting: z.boolean().optional(),
            marketControl: z.boolean().optional(),
            trading: z.boolean().optional(),
            modAlert: z.boolean().optional(), // false to clear active mod alert
          })
          .optional(),
        unbanTimes: z
          .object({
            posting: z.number().optional(),
            marketControl: z.number().optional(),
            trading: z.number().optional(),
            modAlert: z.number().optional(), // mod alerts don't auto-expire, but included for type consistency
          })
          .optional(),
        reason: z.string().optional(),
        modAlert: z
          .object({
            message: z.string(),
          })
          .optional(),
        unbanNote: z.string().optional(), // mod notes when removing a ban (not shown to user)
        // Username change restriction - defaults to restricting when any ban is applied
        // Set to true to allow username changes, false to restrict, undefined to use default behavior
        allowUsernameChange: z.boolean().optional(),
        // Remove all active bans at once, creates a single combined history record
        removeAllBans: z.boolean().optional(),
        // Clear a specific mod alert by ID (used when multiple alerts exist)
        clearAlertId: z.number().optional(),
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'dismiss-mod-alert': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      alertId: z.number().optional(), // Specific alert to dismiss, or all if not provided
    }).strict(),
    returns: {} as { success: boolean },
  },
  'super-ban-user': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
  },
  'get-user-bans': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      bans: {
        id: number
        user_id: string
        ban_type: string
        reason: string | null
        created_at: string
        created_by: string | null
        end_time: string | null
        ended_by: string | null
        ended_at: string | null
      }[]
    },
  },
  'get-boost-analytics': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
    returns: {} as {
      uniqueViewers: number
      totalViews: number
      uniquePromotedViewers: number
      totalPromotedViews: number
      boostPeriods: {
        startTime: string
        endTime: string
        creatorName: string
        creatorUsername: string
      }[]
    },
  },
  'get-seen-market-ids': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      contractIds: z.array(z.string()),
      types: z.array(z.enum(['page', 'card', 'promoted'])).optional(),
      since: z.number(),
    }),
    returns: [] as string[],
  },
  'search-groups': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
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
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as AnyBalanceChangeType[],
    props: z
      .object({
        before: z.coerce.number().optional(),
        after: z.coerce.number().default(0),
        userId: z.string(),
      })
      .strict(),
  },
  'get-partner-stats': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as {
      status: 'success' | 'error'
      username: string
      numContractsCreated: number
      numUniqueBettors: number
      numReferrals: number
      numReferralsWhoRetained: number
      totalTraderIncome: number
      totalReferralIncome: number
      dollarsEarned: number
    },
  },
  'record-contract-view': {
    method: 'POST',
    visibility: 'public',
    authed: false,
    props: z.object({
      userId: z.string().optional(),
      contractId: z.string(),
      kind: z.enum(['page', 'card', 'promoted']),
    }),
    returns: {} as { status: 'success' },
  },
  'record-comment-view': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      contractId: z.string(),
      commentId: z.string(),
    }),
    returns: {} as { status: 'success' },
  },
  'record-contract-interaction': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({
      contractId: z.string(),
      kind: z.enum([
        'page bet',
        'page comment',
        'page repost',
        'page like',
        'card bet',
        'card click',
        'promoted click',
        'card like',
        'page share',
        'browse click',
      ]),
      commentId: z.string().optional(),
      feedReasons: z.array(z.string()).optional(),
      feedType: z.string().optional(),
      betGroupId: z.string().optional(),
      betId: z.string().optional(),
    }),
    returns: {} as { status: 'success' },
  },
  'get-dashboard-from-slug': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({
      dashboardSlug: z.string(),
    }),
    cache: DEFAULT_CACHE_STRATEGY,
    returns: {} as Dashboard,
  },
  'get-posts': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    preferAuth: true,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z
      .object({
        sortBy: z
          .enum(['created_time', 'importance_score', 'new-comments'])
          .optional()
          .default('created_time'),
        term: z.string().optional(),
        limit: z.coerce.number().gte(0).lte(200).default(100),
        userId: z.string().optional(),
        offset: z.coerce.number().gte(0).default(0),
        isChangeLog: coerceBoolean.optional(),
      })
      .strict(),
    returns: [] as TopLevelPost[],
  },
  'create-public-chat-message': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as ChatMessage,
    props: z.object({
      content: contentSchema,
      channelId: z.string(),
    }),
  },
  'get-followed-groups': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z.object({
      userId: z.string(),
    }),
    returns: {} as {
      groups: Group[]
    },
  },
  'get-user-portfolio': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z.object({
      userId: z.string(),
    }),
    returns: {} as LivePortfolioMetrics,
  },
  'get-user-portfolio-history': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z.object({
      userId: z.string(),
      period: z.enum(PERIODS),
    }),
    returns: {} as PortfolioMetrics[],
  },
  'get-channel-memberships': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      channelId: z.coerce.number().optional(),
      createdTime: z.string().optional(),
      lastUpdatedTime: z.string().optional(),
      limit: z.coerce.number(),
    }),
    returns: {
      channels: [] as PrivateMessageChannel[],
      memberIdsByChannelId: {} as { [channelId: string]: string[] },
    },
  },
  'get-channel-messages': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      channelId: z.coerce.number(),
      limit: z.coerce.number(),
      id: z.coerce.number().optional(),
    }),
    returns: [] as PrivateChatMessage[],
  },
  'get-channel-seen-time': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      channelIds: z.array(z.coerce.number()),
    }),
    returns: [] as [number, string][],
  },
  'set-channel-seen-time': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({
      channelId: z.coerce.number(),
    }),
  },
  'get-feed': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      contracts: Contract[]
      comments: ContractComment[]
      bets: Bet[]
      reposts: Repost[]
      idsToReason: { [id: string]: string }
    },
    props: z
      .object({
        userId: z.string(),
        limit: z.coerce.number().gt(0).lte(100).default(100),
        offset: z.coerce.number().gte(0).default(0),
        ignoreContractIds: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'get-mana-supply': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as ManaSupply,
    props: z.object({}).strict(),
  },
  'get-notifications': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: [] as Notification[],
    props: z
      .object({
        after: z.coerce.number().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(100),
      })
      .strict(),
  },
  'update-mod-report': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        reportId: z.number(),
        updates: z
          .object({
            status: z
              .enum(['new', 'under review', 'resolved', 'needs admin'])
              .optional(),
            mod_note: z.string().optional(),
          })
          .partial(),
      })
      .strict(),
    returns: {} as { status: string; report: ModReport },
  },
  'get-mod-reports': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        statuses: z.array(
          z.enum(['new', 'under review', 'resolved', 'needs admin'])
        ),
        limit: z.coerce.number().gte(0).lte(100).default(25),
        offset: z.coerce.number().gte(0).default(0),
        count: coerceBoolean.optional(),
      })
      .strict(),
    returns: {} as {
      status: string
      count?: number
      reports: ModReport[]
    },
  },
  'get-txn-summary-stats': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as Row<'txn_summary_stats'>[],
    props: z
      .object({
        ignoreCategories: z.array(z.string()).optional(),
        fromType: z.string().optional(),
        toType: z.string().optional(),
        limitDays: z.coerce.number(),
      })
      .strict(),
  },
  'get-mana-summary-stats': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as Row<'mana_supply_stats'>[],
    props: z
      .object({
        limitDays: z.coerce.number(),
      })
      .strict(),
  },
  'get-active-user-mana-stats': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: [] as {
      date: string
      activeBalance: number
    }[],
    props: z
      .object({
        limitDays: z.coerce.number(),
      })
      .strict(),
  },
  'register-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: verificationParams,
    returns: {} as RegistrationReturnType,
  },
  'get-verification-status-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      documents?: GIDXDocument[]
      message?: string
      documentStatus?: string
    },
    props: z.object({}),
  },
  'get-monitor-status-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      message?: string
    },
    props: z.object({
      DeviceGPS: GPSProps,
    }),
  },
  'get-checkout-session-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      message?: string
      session?: CheckoutSession
    },
    props: z.object({
      PayActionCode: z.enum(['PAY', 'PAYOUT']).default('PAY'),
      DeviceGPS: GPSProps,
      userId: z.string().optional(),
      ip: z.string().optional(),
    }),
  },
  'complete-checkout-session-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      message?: string
      gidxMessage?: string | null
      details?: PaymentDetail[]
    },
    props: z.object(checkoutParams),
  },
  'complete-cashout-session-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      message?: string
      gidxMessage?: string | null
      details?: PaymentDetail[]
    },
    props: z.object(cashoutParams),
  },
  'complete-cashout-request': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      message?: string
      gidxMessage?: string | null
      details?: PaymentDetail[]
    },
    props: z.object(cashoutRequestParams),
  },
  'get-verification-documents-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      documents: GIDXDocument[]
      utilityDocuments: GIDXDocument[]
      idDocuments: GIDXDocument[]
      rejectedDocuments: GIDXDocument[]
    },
    props: z.object({}),
  },
  'upload-document-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { status: string },
    props: z.object({
      CategoryType: z.number().gte(1).lte(7),
      fileName: z.string(),
      fileUrl: z.string(),
    }),
  },
  'get-best-comments': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { comments: ContractComment[]; contracts: Contract[] },
    props: z.object({
      limit: z.coerce.number().gte(0).lte(100).default(20),
      offset: z.coerce.number().gte(0).default(0),
      ignoreContractIds: z.array(z.string()).optional(),
      justLikes: z.coerce.number().optional(),
    }),
  },
  'get-cashouts': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    returns: [] as PendingCashoutStatusData[],
    props: z
      .object({
        limit: z.coerce.number().gte(0).lte(100).default(10),
        offset: z.coerce.number().gte(0).default(0),
        userId: z.string().optional(),
      })
      .strict(),
  },
  txns: {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z
      .object({
        token: z.string().optional(),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().gte(0).lte(100).default(100),
        before: z.coerce.number().optional(),
        after: z.coerce.number().optional(),
        toId: z.string().optional(),
        fromId: z.string().optional(),
        category: z.string().optional(),
        ignoreCategories: z.array(z.string()).optional(),
      })
      .strict(),
    returns: [] as Txn[],
  },
  'generate-ai-market-suggestions': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: [] as AIGeneratedMarket[],
    props: z
      .object({
        prompt: z.string(),
        existingTitles: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'generate-ai-description': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { description: JSONContent | undefined },
    props: z
      .object({
        question: z.string(),
        description: z.string().optional(),
        answers: z.array(z.string()).optional(),
        outcomeType: z.string().optional(),
        shouldAnswersSumToOne: coerceBoolean.optional(),
        addAnswersMode: z
          .enum(['DISABLED', 'ONLY_CREATOR', 'ANYONE'])
          .optional(),
      })
      .strict(),
  },
  'generate-ai-answers': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as {
      answers: string[]
      addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
    },
    props: z
      .object({
        question: z.string(),
        answers: z.array(z.string()),
        shouldAnswersSumToOne: coerceBoolean,
        description: z.string().optional(),
      })
      .strict(),
  },
  'check-poll-suggestion': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as {
      isSubjective: boolean
      confidence: number
      reason: string
    },
    props: z
      .object({
        question: z.string(),
        answers: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'cast-poll-vote': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { status: string; voteId: string },
    props: z
      .object({
        contractId: z.string(),
        voteId: z.string().optional(),
        voteIds: z.array(z.string()).optional(),
        rankedVoteIds: z.array(z.string()).optional(),
      })
      .strict(),
  },
  'get-next-loan-amount': {
    method: 'GET',
    visibility: 'undocumented',
    cache: DEFAULT_CACHE_STRATEGY,
    authed: false,
    returns: {} as {
      maxGeneralLoan: number
      currentLoan: number
      available: number
      dailyLimit: number
      todayLoans: number
      availableToday: number
      // Free/margin loan breakdown
      currentFreeLoan?: number
      currentMarginLoan?: number
      freeLoanAvailable?: number
      canClaimFreeLoan?: boolean
      hasMarginLoanAccess?: boolean
      // Equity-based calculation fields (equity = portfolioValue - loans)
      equity?: number
      portfolioValue?: number
    },
    props: z.object({
      userId: z.string(),
    }),
  },
  'get-market-loan-max': {
    method: 'GET',
    visibility: 'undocumented',
    cache: DEFAULT_CACHE_STRATEGY,
    authed: true,
    returns: {} as {
      maxLoan: number
      currentLoan: number
      currentFreeLoan: number
      currentMarginLoan: number
      available: number
      equityLimit: number
      totalPositionValue: number
      eligible: boolean
      eligibilityReason?: string
      // Aggregate limits (tier-specific % of equity across all markets)
      aggregateLimit: number
      totalLoanAllMarkets: number
      availableAggregate: number
      // Daily limits (10% of equity per day)
      dailyLimit: number
      todayLoans: number
      availableToday: number
      // Per-answer loan data (for multi-choice markets)
      answerLoans?: Array<{
        answerId: string
        loan: number
        freeLoan: number
        marginLoan: number
        positionValue: number
      }>
    },
    props: z.object({
      contractId: z.string(),
      answerId: z.string().optional(),
    }),
  },
  'get-free-loan-available': {
    method: 'GET',
    visibility: 'undocumented',
    cache: DEFAULT_CACHE_STRATEGY,
    authed: true,
    returns: {} as {
      available: number
      canClaim: boolean
      lastClaimTime: number | null
      // Breakdown by position
      positions: Array<{
        contractId: string
        answerId: string | null
        payout: number
        invested: number
        freeLoanContribution: number
      }>
      // Current totals
      currentFreeLoan: number
      currentMarginLoan: number
      totalLoan: number
      // Limits
      maxLoan: number
      dailyLimit: number
      todayLoans: number
      // Today's claimed free loan
      todaysFreeLoan: number
    },
    props: z.object({}),
  },
  'claim-free-loan': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      success: boolean
      amount: number
      distributed: Array<{
        contractId: string
        answerId: string | null
        amount: number
      }>
    },
    props: z.object({}),
  },
  'create-task': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as Task,
    props: z
      .object({
        text: z.string(),
        category_id: z.number().optional(),
        priority: z.number().default(0),
        assignee_id: z.string().optional(),
      })
      .strict(),
  },
  'update-task': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        id: z.number(),
        text: z.string().optional(),
        completed: z.boolean().optional(),
        priority: z.number().optional(),
        category_id: z.number().optional(),
        archived: z.boolean().optional(),
        assignee_id: z.string().optional(),
      })
      .strict(),
  },
  'create-category': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { id: number },
    props: z
      .object({
        name: z.string(),
        color: z.string().optional(),
        displayOrder: z.number().optional(),
      })
      .strict(),
  },
  'get-categories': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: {} as { categories: TaskCategory[] },
    props: z.object({}).strict(),
  },
  'update-category': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        categoryId: z.number(),
        name: z.string().optional(),
        color: z.string().optional(),
        displayOrder: z.number().optional(),
        archived: z.boolean().optional(),
      })
      .strict(),
  },
  'get-tasks': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: {} as { tasks: Task[] },
    props: z.object({}).strict(),
  },
  'get-user-achievements': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      userId: string
      creatorTraders: number
      totalReferrals: number
      totalReferredProfitMana: number
      totalVolumeMana: number
      seasonsPlatinumOrHigher: number
      seasonsDiamondOrHigher: number
      seasonsMasters: number
      numberOfComments: number
      totalLiquidityCreatedMarkets: number
      totalTradesCount: number
      totalMarketsCreated: number
      accountAgeYears: number
      profitableMarketsCount: number
      unprofitableMarketsCount: number
      largestProfitableTradeValue: number
      largestUnprofitableTradeValue: number
      longestBettingStreak: number
      largestLeagueSeasonEarnings: number
      modTicketsResolved: number
      charityDonatedMana: number
      ranks: RanksType
    },
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
  },
  'get-user-calibration': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    // Heavy endpoint - cache for 24 hours with 1 hour stale-while-revalidate
    cache: 'public, max-age=86400, stale-while-revalidate=3600',
    returns: {} as {
      calibration: {
        yesPoints: { x: number; y: number }[]
        noPoints: { x: number; y: number }[]
        totalBets: number
      }
      performanceStats: {
        totalProfit: number
        profit365: number
        totalVolume: number
        winRate: number
        totalMarkets: number
        resolvedMarkets: number
        volatility: number
        sharpeRatio: number
        maxDrawdown: number
      }
      portfolioHistory: {
        timestamp: number
        value: number
        profit: number
      }[]
      profitByTopic: {
        topic: string
        profit: number
        volume: number
        marketCount: number
      }[]
    },
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
  },
  'get-site-activity': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      bets: Bet[]
      comments: CommentWithTotalReplies[]
      newContracts: Contract[]
      relatedContracts: Contract[]
    },
    props: z
      .object({
        limit: z.coerce.number().default(10),
        offset: z.coerce.number().default(0),
        blockedUserIds: z.array(z.string()).optional(),
        blockedGroupSlugs: z.array(z.string()).optional(),
        blockedContractIds: z.array(z.string()).optional(),
        topicIds: z.array(z.string()).optional(),
        types: z
          .array(z.enum(['bets', 'comments', 'markets', 'limit-orders']))
          .optional(),
        minBetAmount: z.coerce.number().optional(),
        onlyFollowedTopics: coerceBoolean.optional(),
        onlyFollowedContracts: coerceBoolean.optional(),
        onlyFollowedUsers: coerceBoolean.optional(),
        userId: z.string().optional(),
      })
      .strict(),
  },
  'get-unified-feed': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      // Personalized feed data
      contracts: Contract[]
      comments: ContractComment[]
      bets: Bet[]
      reposts: Repost[]
      idsToReason: { [id: string]: string }
      // Boosted markets
      boostedContracts: Contract[]
      // Activity data
      activityBets: Bet[]
      activityComments: CommentWithTotalReplies[]
      activityNewContracts: Contract[]
      activityRelatedContracts: Contract[]
    },
    props: z
      .object({
        userId: z.string().optional(),
        feedLimit: z.coerce.number().gt(0).lte(50).default(5),
        feedOffset: z.coerce.number().gte(0).default(0),
        activityLimit: z.coerce.number().gt(0).lte(50).default(10),
        activityOffset: z.coerce.number().gte(0).default(0),
        ignoreContractIds: z.array(z.string()).optional(),
        blockedUserIds: z.array(z.string()).optional(),
        blockedGroupSlugs: z.array(z.string()).optional(),
        blockedContractIds: z.array(z.string()).optional(),
        minBetAmount: z.coerce.number().optional(),
      })
      .strict(),
  },
  'get-sports-games': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: {} as { schedule: any[] },
    props: z.object({}).strict(),
  },
  'get-market-props': {
    method: 'GET',
    visibility: 'public',
    cache: DEFAULT_CACHE_STRATEGY,
    // Could set authed false and preferAuth with an api secret if we want it to replace static props
    authed: true,
    returns: {} as {
      manaContract: MarketContract
      chartAnnotations: ChartAnnotation[]
      topics: Topic[]
      comments: ContractComment[]
      pinnedComments: ContractComment[]
      userPositionsByOutcome: {
        YES: ContractMetric[]
        NO: ContractMetric[]
      }
      topContractMetrics: ContractMetric[]
      totalPositions: number
      dashboards: Dashboard[]
      cashContract: MarketContract
      totalManaBets: number
      totalCashBets: number
    },
    props: z.object({
      slug: z.string().optional(),
      id: z.string().optional(),
    }),
  },
  'get-user-contract-metrics-with-contracts': {
    method: 'GET',
    visibility: 'public',
    preferAuth: true,
    authed: false,
    returns: {} as {
      metricsByContract: Dictionary<ContractMetric[]>
      // NOTE: this only returns the currently used contract props to save on bandwidth
      contracts: MarketContract[]
    },
    props: z
      .object({
        userId: z.string(),
        limit: z.coerce.number().gte(0).lte(10_000).default(100),
        offset: z.coerce.number().gte(0).optional(),
        perAnswer: coerceBoolean.optional(),
        order: z.enum(['lastBetTime', 'profit']).optional(),
      })
      .strict(),
  },
  validateIap: {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as { success: boolean },
    props: z.object({
      receipt: z.string(),
    }),
  },
  'check-sports-event': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as { exists: boolean; existingMarket?: LiteMarket },
    props: z
      .object({
        sportsEventId: z.string(),
      })
      .strict(),
  },
  'comment-reactions': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as Reaction[],
    props: z
      .object({
        contentIds: z.array(z.string()),
        contentType: z.enum(['comment', 'contract']),
      })
      .strict(),
  },
  'mark-all-notifications-new': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({}).strict(),
    returns: {} as { success: boolean },
  },
  'get-contract-voters': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
    returns: [] as DisplayUser[],
  },
  'get-contract-option-voters': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({ contractId: z.string(), optionId: z.string() }),
    returns: [] as DisplayUser[],
  },
  'purchase-boost': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        contractId: z.string().optional(),
        postId: z.string().optional(),
        startTime: z.number().positive().finite().safe(),
        method: z.enum(['mana', 'cash', 'admin-free']),
      })
      .strict()
      .refine(
        (data) =>
          (data.contractId && !data.postId) ||
          (!data.contractId && data.postId),
        {
          message: 'Either contractId or postId must be provided, but not both',
        }
      ),
    returns: {} as { success: boolean; checkoutUrl?: string },
  },
  'generate-ai-numeric-ranges': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as {
      thresholds: { answers: string[]; midpoints: number[] }
      buckets: { answers: string[]; midpoints: number[] }
    },
    props: z
      .object({
        question: z.string(),
        min: z.number(),
        max: z.number(),
        description: z.string().optional(),
        unit: z.string(),
      })
      .strict(),
  },
  'infer-numeric-unit': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as {
      unit: string
    },
    props: z
      .object({
        question: z.string(),
        description: z.string().optional(),
      })
      .strict(),
  },
  'generate-ai-date-ranges': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as {
      buckets: { answers: string[]; midpoints: number[] }
      thresholds: { answers: string[]; midpoints: number[] }
    },
    props: z
      .object({
        question: z.string(),
        min: z.string(),
        max: z.string(),
        description: z.string().optional(),
      })
      .strict(),
  },
  'regenerate-numeric-midpoints': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { midpoints: number[] },
    props: z
      .object({
        description: z.string().optional(),
        question: z.string(),
        answers: z.array(z.string()),
        min: z.number(),
        max: z.number(),
        unit: z.string(),
        tab: z.enum(['thresholds', 'buckets']),
      })
      .strict(),
  },
  'regenerate-date-midpoints': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { midpoints: number[] },
    props: z
      .object({
        description: z.string().optional(),
        question: z.string(),
        answers: z.array(z.string()),
        min: z.string(),
        max: z.string(),
        tab: z.enum(['thresholds', 'buckets']),
      })
      .strict(),
  },

  'generate-concise-title': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        question: z.string(),
      })
      .strict(),
    returns: {} as { title: string },
  },
  'get-close-date': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        question: z.string(),
        utcOffset: z.number().optional(),
      })
      .strict(),
    returns: {} as { closeTime: number; confidence: number },
  },
  'refer-user': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        referredByUsername: z.string(),
        contractId: z.string().optional(),
      })
      .strict(),
    returns: {} as { success: boolean },
  },

  'save-market-draft': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { id: number },
    props: z
      .object({
        data: z.object({
          question: z.string(),
          description: z.any().optional(),
          outcomeType: z.string(),
          answers: z.array(z.string()).optional(),
          closeDate: z.string().optional(),
          closeHoursMinutes: z.string().optional(),
          visibility: z.string(),
          selectedGroups: z.array(z.any()),
          savedAt: z.number(),
        }),
      })
      .strict(),
  },

  'get-market-drafts': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: [] as MarketDraft[],
    props: z.object({}).strict(),
  },

  'delete-market-draft': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        id: z.coerce.number(),
      })
      .strict(),
  },
  'get-season-info': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z.object({
      season: z.coerce.number().int().positive().optional(),
    }),
    returns: {} as {
      season: number
      startTime: number // epoch ms
      endTime: number | null // epoch ms, null if a *mystery* for clients
      status: 'active' | 'processing' | 'complete'
    },
  },
  'mark-notification-read': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        notificationId: z.string(),
      })
      .strict(),
  },
  'mark-notifications-read': {
    method: 'POST',
    visibility: 'private',
    authed: true,
    returns: {} as { success: boolean },
    props: z
      .object({
        notificationIds: z.array(z.string()),
      })
      .strict(),
  },
  'dismiss-user-report': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        reportId: z.string(),
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'create-post': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { post: TopLevelPost },
    props: z
      .object({
        title: z.string().min(1).max(160),
        content: contentSchema,
        isAnnouncement: z.boolean().optional(),
        visibility: z.enum(['public', 'unlisted']).optional(),
        isChangeLog: z.boolean().optional(),
      })
      .strict(),
  },
  'update-post': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { post: TopLevelPost },
    props: z
      .object({
        id: z.string(),
        title: z.string().min(1).max(480).optional(),
        content: contentSchema.optional(),
        visibility: z.enum(['public', 'unlisted']).optional(),
      })
      .strict(),
  },
  'create-post-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { comment: PostComment },
    props: z
      .object({
        postId: z.string(),
        content: contentSchema,
        replyToCommentId: z.string().optional(),
      })
      .strict(),
  },
  'update-post-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { comment: PostComment },
    props: z
      .object({
        commentId: z.string(),
        postId: z.string(),
        hidden: z.boolean(),
      })
      .strict(),
  },
  'follow-post': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    returns: {} as { success: true },
    props: z
      .object({
        postId: z.string(),
        follow: z.boolean(),
      })
      .strict(),
  },
  'edit-post-comment': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        commentId: z.string(),
        postId: z.string(),
        content: contentSchema,
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'get-user-last-active-time': {
    method: 'GET',
    authed: false,
    visibility: 'undocumented',
    cache: 'public, max-age=900, stale-while-revalidate=90', // 15 minute cache
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: {} as { lastActiveTime: number | null },
  },
  'get-monthly-bets-2025': {
    method: 'GET',
    authed: false,
    visibility: 'undocumented',
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: [] as { month: string; bet_count: number; total_amount: number }[],
  },
  'get-max-min-profit-2025': {
    method: 'GET',
    authed: false,
    visibility: 'undocumented',
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
    returns: [] as {
      profit: number
      has_yes_shares: boolean
      has_no_shares: boolean
      answer_id: string | null
      data: Contract
    }[],
  },
  'get-pending-clarifications': {
    method: 'GET',
    authed: false,
    visibility: 'undocumented',
    props: z
      .object({
        contractId: z.string(),
      })
      .strict(),
    returns: [] as {
      id: number
      contractId: string
      commentId: string
      createdTime: number
      data: { markdown: string; richText: JSONContent }
    }[],
  },
  'apply-pending-clarification': {
    method: 'POST',
    authed: true,
    visibility: 'undocumented',
    props: z
      .object({
        clarificationId: z.number(),
      })
      .strict(),
    returns: {} as { success: boolean; alreadyApplied?: boolean },
  },
  'cancel-pending-clarification': {
    method: 'POST',
    authed: true,
    visibility: 'undocumented',
    props: z
      .object({
        clarificationId: z.number(),
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'get-predictle-markets': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 'public, max-age=60, stale-while-revalidate=30',
    props: z.object({}).strict(),
    returns: {} as {
      markets: {
        id: string
        question: string
        slug: string
        creatorUsername: string
        prob: number
      }[]
      correctOrder: Record<string, number>
      dateString: string
      puzzleNumber: number
    },
  },
  'save-predictle-result': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        puzzleNumber: z.number(),
        won: z.boolean(),
        // Full game state for cross-device sync
        gameState: z.object({
          orderedMarketIds: z.array(z.string()),
          attempts: z.array(
            z.object({
              marketId: z.string(),
              feedback: z.array(z.enum(['correct', 'incorrect'])),
            })
          ),
        }),
      })
      .strict(),
    returns: {} as { success: boolean },
  },
  'get-predictle-result': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({ puzzleNumber: z.coerce.number() }).strict(),
    returns: {} as {
      hasResult: boolean
      result?: {
        won: boolean
        gameState: {
          orderedMarketIds: string[]
          attempts: {
            marketId: string
            feedback: ('correct' | 'incorrect')[]
          }[]
        }
      }
    },
  },
  'get-charity-giveaway': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    props: z.object({ giveawayNum: z.coerce.number().optional() }).strict(),
    returns: {} as {
      giveaway?: {
        giveawayNum: number
        name: string
        prizeAmountUsd: number
        closeTime: number
        winningTicketId: string | null
        createdTime: number
      }
      charityStats: {
        charityId: string
        totalTickets: number
        totalManaSpent: number
      }[]
      totalTickets: number
      winningCharity?: string
      winner?: {
        id: string
        username: string
        name: string
        avatarUrl: string
      }
      // Provably fair fields
      nonceHash?: string // MD5 hash of nonce, always shown when giveaway exists
      nonce?: string // Actual nonce, only revealed AFTER winner is selected for verification
    },
  },
  'buy-charity-giveaway-tickets': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        giveawayNum: z.number(),
        charityId: z.string(),
        numTickets: z.number().positive(),
      })
      .strict(),
    returns: {} as {
      ticketId: string
      numTickets: number
      manaSpent: number
    },
  },
  'get-charity-giveaway-sales': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    props: z
      .object({
        giveawayNum: z.coerce.number(),
        limit: z.coerce.number().min(1).max(100).default(50),
        before: z.string().optional(),
      })
      .strict(),
    cache: LIGHT_CACHE_STRATEGY,
    returns: {} as {
      sales: {
        id: string
        giveawayNum: number
        charityId: string
        userId: string
        numTickets: number
        manaSpent: number
        createdTime: number
      }[]
    },
  },
  'select-charity-giveaway-winner': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({ giveawayNum: z.number() }).strict(),
    returns: {} as {
      ticketId: string
      charityId: string
      userId: string
    },
  },
  'get-predictle-percentile': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    props: z
      .object({
        puzzleNumber: z.coerce.number(),
        attempts: z.coerce.number(),
      })
      .strict(),
    returns: {} as {
      percentile: number // 0-100, percentage of users you beat
      totalUsers: number
    },
  },
  // Shop endpoints
  'get-shop-items': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({}).strict(),
    returns: [] as ShopItem[],
  },
  'shop-purchase': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        itemId: z.string(),
      })
      .strict(),
    returns: {} as {
      success: boolean
      entitlement?: UserEntitlement
      entitlements: UserEntitlement[]
      upgradeCredit?: number
    },
  },
  'shop-toggle': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        itemId: z.string(),
        enabled: z.boolean(),
      })
      .strict(),
    returns: {} as { success: boolean; entitlements: UserEntitlement[] },
  },
  'shop-cancel-subscription': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z.object({}).strict(),
    returns: {} as { success: boolean; entitlements: UserEntitlement[] },
  },
  'shop-reset-all': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z.object({}).strict(),
    returns: {} as { success: boolean; refundedAmount: number },
  },
  // Admin spam detection endpoints
  'get-suspected-spam-comments': {
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        limit: z.coerce.number().min(1).max(1000).default(20),
        offset: z.coerce.number().default(0),
        ignoredIds: z.array(z.string()).optional(),
      })
      .strict(),
    returns: {} as {
      comments: {
        commentId: string
        contractId: string
        content: JSONContent | null
        commentText: string
        marketTitle: string
        marketSlug: string
        creatorUsername: string
        userId: string
        userName: string
        userUsername: string
        userAvatarUrl: string | null
        createdTime: number
        isSpam: boolean | null
      }[]
      total: number
    },
  },
  'delete-spam-comments': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        commentIds: z.array(z.string()),
      })
      .strict(),
    returns: {} as { success: boolean; deletedCount: number },
  },
  'get-bettors-from-bet-ids': {
    method: 'GET',
    visibility: 'undocumented',
    cache: 'public, max-age=600, stale-while-revalidate=30',
    authed: false,
    props: z
      .object({
        betIds: z.array(z.string()).max(50),
      })
      .strict(),
    returns: {} as Record<
      string,
      { id: string; username: string; name: string }
    >,
  },
  'get-top-markets-yesterday': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: 'public, max-age=3600, stale-while-revalidate=600',
    props: z.object({}).strict(),
    returns: {} as {
      topByTraders: {
        contract: Contract
        tradersYesterday: number
      }[]
      topByViews: {
        contract: Contract
        viewsYesterday: number
      }[]
    },
  },
  'get-shop-stats': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    cache: LIGHT_CACHE_STRATEGY,
    props: z
      .object({
        limitDays: z.coerce.number(),
      })
      .strict(),
    returns: {} as {
      subscriptionSales: {
        date: string
        itemId: string
        quantity: number
        revenue: number
      }[]
      digitalGoodsSales: {
        date: string
        itemId: string
        quantity: number
        revenue: number
      }[]
      subscribersByTier: {
        tier: 'basic' | 'plus' | 'premium'
        count: number
        autoRenewCount: number
      }[]
      subscriptionsOverTime: {
        date: string
        basicCount: number
        plusCount: number
        premiumCount: number
        totalCount: number
      }[]
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

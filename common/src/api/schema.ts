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
import { type Answer } from 'common/answer'
import { MAX_COMMENT_LENGTH, type ContractComment } from 'common/comment'
import { CandidateBet } from 'common/new-bet'
import type { Bet, LimitBet } from 'common/bet'
import { coerceBoolean, contentSchema } from 'common/api/zod-types'
import { Lover } from 'common/love/lover'
import { AIGeneratedMarket, Contract, MarketContract } from 'common/contract'
import { CompatibilityScore } from 'common/love/compatibility-score'
import type { Txn, ManaPayTxn } from 'common/txn'
import { LiquidityProvision } from 'common/liquidity-provision'
import { DisplayUser, FullUser } from './user-types'
import { League } from 'common/leagues'
import { searchProps } from './market-search-types'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { type LinkPreview } from 'common/link-preview'
import { Headline } from 'common/news'
import { Row } from 'common/supabase/utils'
import { LikeData, ShipData } from './love-types'
import { AnyBalanceChangeType } from 'common/balance-change'
import { Dashboard } from 'common/dashboard'
import { ChatMessage, PrivateChatMessage } from 'common/chat-message'
import { PrivateUser, User } from '../user'
import { ManaSupply } from 'common/stats'
import { Repost } from 'common/repost'
import { PERIODS } from 'common/period'
import { SWEEPS_MIN_BET } from 'common/economy'
import {
  LivePortfolioMetrics,
  PortfolioMetrics,
} from 'common/portfolio-metrics'
import { ModReport } from '../mod-report'

import { RegistrationReturnType } from 'common/reason-codes'
import {
  CheckoutSession,
  GIDXDocument,
  GPSProps,
  PaymentDetail,
  checkoutParams,
  verificationParams,
  cashoutRequestParams,
  PendingCashoutStatusData,
  cashoutParams,
} from 'common/gidx/gidx'
import { notification_preference } from 'common/user-notification-preferences'
import { PrivateMessageChannel } from 'common/supabase/private-messages'
import { Notification } from 'common/notification'
import { NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'
import { ContractMetric } from 'common/contract-metric'

import { JSONContent } from '@tiptap/core'
import { Task, TaskCategory } from 'common/todo'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { Dictionary } from 'lodash'
import { Reaction } from 'common/reaction'
import { YEAR_MS } from 'common/util/time'
// mqp: very unscientific, just balancing our willingness to accept load
// with user willingness to put up with stale data
export const DEFAULT_CACHE_STRATEGY =
  'public, max-age=5, stale-while-revalidate=10'
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
        token: z.enum(['MANA', 'CASH']),
      })
      .strict(),
    returns: {} as { status: boolean },
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
    authed: true,
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
    returns: {} as Answer,
    props: z.object({ answerId: z.string() }).strict(),
  },
  'market/:contractId/answers': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: [] as Answer[],
    props: z.object({ contractId: z.string() }).strict(),
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
    cache: DEFAULT_CACHE_STRATEGY,
    returns: [] as ContractComment[],
    props: z
      .object({
        contractId: z.string().optional(),
        contractSlug: z.string().optional(),
        afterTime: z.coerce.number().optional(),
        limit: z.coerce.number().gte(0).lte(1000).default(1000),
        page: z.coerce.number().gte(0).default(0),
        userId: z.string().optional(),
        isPolitics: coerceBoolean.optional(),
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
    visibility: 'undocumented',
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
    visibility: 'undocumented',
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
      })
      .strict(),
  },
  'get-user-limit-orders-with-contracts': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    returns: {} as {
      betsByContract: { [contractId: string]: LimitBet[] }
      contracts: Contract[]
    },
    props: z
      .object({
        userId: z.string(),
        count: z.coerce.number().lte(5000),
      })
      .strict(),
  },
  'get-interesting-groups-from-views': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
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
        // undocumented fields. idk what a good api interface would be
        filterRedemptions: coerceBoolean.optional(),
        includeZeroShareRedemptions: coerceBoolean.optional(),
        commentRepliesOnly: coerceBoolean.optional(),
        count: coerceBoolean.optional(),
        points: coerceBoolean.optional(),
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
      })
      .strict(),
    returns: {} as {
      manaMetrics: ContractMetric[]
      cashMetrics: ContractMetric[]
      contracts: MarketContract[]
      manaProfit: number
      cashProfit: number
      manaInvestmentValue: number
      cashInvestmentValue: number
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
    method: 'GET',
    visibility: 'undocumented',
    authed: true,
    props: z.object({}),
    returns: {} as { payout: number },
  },
  // deprecated. use /txns instead
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
      })
      .strict(),
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
    returns: [] as Headline[],
    props: z.object({
      slug: z.enum(['politics', 'ai', 'news']).optional(),
    }),
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
        contentType: z.enum(['comment', 'contract']),
        remove: z.boolean().optional(),
        reactionType: z.enum(['like', 'dislike']).optional().default('like'),
      })
      .strict(),
    returns: { success: true },
  },
  'compatible-lovers': {
    method: 'GET',
    visibility: 'private',
    authed: false,
    props: z.object({ userId: z.string() }),
    returns: {} as {
      lover: Lover
      compatibleLovers: Lover[]
      loverCompatibilityScores: {
        [userId: string]: CompatibilityScore
      }
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
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    props: z
      .object({
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100),
        userId: z.string().optional(),
      })
      .strict(),
    returns: {} as {
      marketsFromEmbeddings: Contract[]
    },
    cache: 'public, max-age=3600, stale-while-revalidate=10',
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
  'unlist-and-cancel-user-contracts': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    props: z
      .object({
        userId: z.string(),
      })
      .strict(),
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
    props: z.object({
      userId: z.string(),
    }),
    returns: {} as LivePortfolioMetrics,
  },
  'get-user-portfolio-history': {
    method: 'GET',
    visibility: 'public',
    authed: false,
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
    returns: {} as Row<'mana_supply_stats'>[],
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
  'identity-callback-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    returns: {} as { Accepted: boolean },
    props: z.object({
      MerchantCustomerID: z.string(),
      NotificationType: z.string(),
    }),
  },
  'payment-callback-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    returns: {} as { MerchantTransactionID: string },
    props: z
      .object({
        MerchantTransactionID: z.string(),
        TransactionStatusCode: z.coerce.number(),
        TransactionStatusMessage: z.string(),
        StatusCode: z.coerce.number(),
        SessionID: z.string(),
        MerchantSessionID: z.string(),
        SessionScore: z.coerce.number(),
        ReasonCodes: z.array(z.string()).optional(),
        ServiceType: z.string(),
        StatusMessage: z.string(),
      })
      .strict(),
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
  'get-redeemable-prize-cash': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: {} as { redeemablePrizeCash: number },
    props: z.object({}),
  },
  'get-total-redeemable-prize-cash': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as { total: number },
    props: z.object({}),
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
  'get-kyc-stats': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    props: z.object({}),
    returns: {} as {
      initialVerifications: {
        count: number
        day: string
      }[]
      phoneVerifications: {
        count: number
        day: string
      }[]
    },
  },
  txns: {
    method: 'GET',
    visibility: 'public',
    authed: false,
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
  'generate-ai-market-suggestions-2': {
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
  'get-monthly-bets-2024': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({ userId: z.string() }),
    returns: [] as { month: string; bet_count: number; total_amount: number }[],
  },
  'get-max-min-profit-2024': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    props: z.object({ userId: z.string() }),
    returns: [] as {
      profit: number
      data: Contract
      answer_id: string | null
      has_no_shares: boolean
      has_yes_shares: boolean
    }[],
  },
  'get-next-loan-amount': {
    method: 'GET',
    visibility: 'undocumented',
    cache: DEFAULT_CACHE_STRATEGY,
    authed: false,
    returns: {} as { amount: number },
    props: z.object({
      userId: z.string(),
    }),
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
  'is-sports-interested': {
    method: 'GET',
    visibility: 'public',
    authed: true,
    returns: {} as { isSportsInterested: boolean },
    props: z.object({}).strict(),
  },
  'get-site-activity': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as {
      bets: Bet[]
      comments: ContractComment[]
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
      contracts: Contract[]
    },
    props: z.object({
      userId: z.string(),
      limit: z.coerce.number(),
      offset: z.coerce.number().gte(0).optional(),
      perAnswer: coerceBoolean.optional(),
      inMani: coerceBoolean.optional(),
    }),
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
    authed: false,
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
    authed: false,
    props: z.object({ contractId: z.string(), optionId: z.string() }),
    returns: [] as DisplayUser[],
  },
  'purchase-contract-boost': {
    method: 'POST',
    visibility: 'public',
    authed: true,
    props: z
      .object({
        contractId: z.string(),
        startTime: z.number().positive().finite().safe(),
        method: z.enum(['mana', 'cash']),
      })
      .strict(),
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
        includeOuterRanges: z.boolean().optional(),
        unit: z.string().optional(),
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
      })
      .strict(),
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

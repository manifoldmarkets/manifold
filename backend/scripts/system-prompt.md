Manifold is the world's most popular prediction market website.

Manifold lets you bet on upcoming events using play money. As other users bet against you, it creates a probability of how likely the event will happen—this is known as a prediction market.
Bet on current events, politics, tech, and AI, or create your own market about an event you care about for others to trade on!

Our mission:
Provide the most accurate, real-time predictions on any event.
Combat misleading news by incentivising traders to be fast and correct.
Help people make more informed decisions by improving their model of the future.

1. Basics and How It Works:
   - Prediction markets allow betting on future event outcomes.
   - Prices of shares represent the probability of events occurring.
   - Anyone can create markets on any topic.
   - Manifold uses play-money (mana) instead of real currency.
   - The platform has proven to be effective at forecasting, despite not using real money.

2. Using Manifold:
   - Users start with 200 mana for free.
   - Mana can be used to bet, create markets, and promote questions.
   - Prize points can be earned and converted to mana or donated to charities.
   - Users can earn mana through correct predictions, successful trades, creating popular markets, completing quests, and referring friends.

3. Types of Questions:
   - Personal (fun wagers, recommendations, accountability goals)
   - News and current events
   - Politics, sports, economics
   - Impactful causes and research
   - Project management

4. Best Practices for Creating Markets:
   - Set clear resolution criteria
   - Include a resolution date
   - Write an engaging description
   - Add the market to relevant topics/groups
   - Share your own opinion
   - Promote your market
   - Subsidize your market for increased activity

5. Tips for Becoming a Good Trader:
   - Find inaccurate probabilities
   - React quickly to news
   - Buy low, sell high
   - Create innovative answers in free response markets
   - Sort markets by close date or newest
   - Follow successful traders

6. Market Resolution:
   - Market creators resolve their own markets
   - Resolution should be timely and based on predetermined criteria
   - Options include Yes/No, Partial, or multiple choice resolutions
   - N/A resolution (market cancellation) is limited to moderators

7. Market Mechanics:
   - Prices and probabilities are determined by trader activity
   - Users buy shares of outcomes, with each correct share worth 1 mana at resolution
   - Manifold uses a combination of limit orders and automated market maker
   - Limit orders allow betting at specific probabilities
   - Liquidity pool affects market stability and tradability

8. Payouts and Loans:
   - Payouts are calculated based on the number of shares owned
   - Loans (now deprecated) used to provide daily returns on bet amounts

9. Miscellaneous:
   - Users can donate to various charities using prize points
   - Customizable notification settings
   - Account deletion process explained
   - Content moderation policy and reporting process outlined
   - Official API available

10. Unique Features:
    - Largest range of prediction topics due to user-generated content
    - Free to play with prizes available in select regions
    - Community-driven question creation and resolution

11. Fair Play and Dispute Resolution:
    - Community guidelines enforce fair play
    - Disputes can be reported to moderators for review
    - Markets may be re-resolved in cases of abuse, misresolution, or technical failures


  Hello this is a short guide to coding on Manifold! It was written to provide context to Claude, so he can know how to code for us.

Here's an example component in our style:

```ts
import clsx from 'clsx'
import { isAdminId, isModId } from 'common/envs/constants'
import { type Headline } from 'common/news'
import Link from 'next/link'
import { EditNewsButton } from 'web/components/news/edit-news-button'
import { Carousel } from 'web/components/widgets/carousel'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'
import { removeEmojis } from 'common/util/string'

export function HeadlineTabs(props: {
  headlines: Headline[]
  currentSlug: string
  endpoint: DashboardEndpoints
  hideEmoji?: boolean
  notSticky?: boolean
  className?: string
}) {
  const { headlines, endpoint, currentSlug, hideEmoji, notSticky, className } =
    props
  const user = useUser()

  return (
    <div
      className={clsx(
        className,
        'bg-canvas-50 w-full',
        !notSticky && 'sticky top-0 z-50'
      )}
    >
      <Carousel labelsParentClassName="gap-px">
        {headlines.map(({ id, slug, title }) => (
          <Tab
            key={id}
            label={hideEmoji ? removeEmojis(title) : title}
            href={`/${endpoint}/${slug}`}
            active={slug === currentSlug}
          />
        ))}
        {user && <Tab label="More" href="/dashboard" />}
        {user && (isAdminId(user.id) || isModId(user.id)) && (
          <EditNewsButton endpoint={endpoint} defaultDashboards={headlines} />
        )}
      </Carousel>
    </div>
  )
}
```

It's best to export the main component at the top of the file. We also try to name the component the same as the file name (headline-tabs.tsx) so that it's easy to find.

Here's another example in `home.tsx` that calls our api. We have an endpoint called 'headlines', which is being cached by NextJS:

```ts
import { api } from 'web/lib/api/api'
// More imports...

export async function getStaticProps() {
  try {
    const headlines = await api('headlines', {})
    return {
      props: {
        headlines,
        revalidate: 30 * 60, // 30 minutes
      },
    }
  } catch (err) {
    return { props: { headlines: [] }, revalidate: 60 }
  }
}

export default function Home(props: { headlines: Headline[] }) { ... }
```

If we are calling the API on the client, prefer using the `useAPIGetter` hook:

```ts
export const YourTopicsSection = (props: {
  user: User
  className?: string
}) => {
  const { user, className } = props
  const { data, refresh } = useAPIGetter('get-followed-groups', {
    userId: user.id,
  })
  const followedGroups = data?.groups ?? []
  ...
```

This stores the result in memory, and allows you to call refresh() to get an updated version.

We frequently use `usePersistentInMemoryState` or `usePersistentLocalState` as an alternative to `useState`. These cache data. Most of the time you want in memory caching so that navigating back to a page will preserve the same state and appear to load instantly.

Here's the definition of usePersistentInMemoryState:

```ts
export const usePersistentInMemoryState = <T>(initialValue: T, key: string) => {
  const [state, setState] = useStateCheckEquality<T>(
    safeJsonParse(store[key]) ?? initialValue
  )

  useEffect(() => {
    const storedValue = safeJsonParse(store[key]) ?? initialValue
    setState(storedValue as T)
  }, [key])

  const saveState = useEvent((newState: T | ((prevState: T) => T)) => {
    setState((prevState) => {
      const updatedState = isFunction(newState) ? newState(prevState) : newState
      store[key] = JSON.stringify(updatedState)
      return updatedState
    })
  })

  return [state, saveState] as const
}
```

We prefer using lodash functions instead of reimplementing them with for loops:

```ts
import { keyBy, uniq } from 'lodash'

const betsByUserId = keyBy(bets, 'userId')
const betIds = uniq(bets, (b) => b.id)
```

When organizing imports, we put the external libraries at the top, followed by a new line, and then our internal imports.

```ts
import { useState } from 'react'
import { keyBy } from 'lodash'

import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useUser } from 'web/hooks/use-user'
```

For live updates, we use websockets. In `use-api-subscription.ts`, we have this hook:

```ts
export function useApiSubscription(opts: SubscriptionOptions) {
  useEffect(() => {
    const ws = client
    if (ws != null) {
      if (opts.enabled ?? true) {
        ws.subscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
        return () => {
          ws.unsubscribe(opts.topics, opts.onBroadcast).catch(opts.onError)
        }
      }
    }
  }, [opts.enabled, JSON.stringify(opts.topics)])
}
```

In `use-bets`, we have this hook to get live updates with useApiSubscription:

```ts
export const useContractBets = (
  contractId: string,
  opts?: APIParams<'bets'> & { enabled?: boolean }
) => {
  const { enabled = true, ...apiOptions } = {
    contractId,
    ...opts,
  }
  const optionsKey = JSON.stringify(apiOptions)

  const [newBets, setNewBets] = usePersistentInMemoryState<Bet[]>(
    [],
    `${optionsKey}-bets`
  )

  const addBets = (bets: Bet[]) => {
    setNewBets((currentBets) => {
      const uniqueBets = sortBy(
        uniqBy([...currentBets, ...bets], 'id'),
        'createdTime'
      )
      return uniqueBets.filter((b) => !betShouldBeFiltered(b, apiOptions))
    })
  }

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible && enabled) {
      api('bets', apiOptions).then(addBets)
    }
  }, [optionsKey, enabled, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-bet`],
    onBroadcast: (msg) => {
      addBets(msg.data.bets as Bet[])
    },
    enabled,
  })

  return newBets
}
```

Here are all the topics we broadcast, from `backend/shared/src/websockets/helpers.ts`

```ts
export function broadcastUpdatedPrivateUser(userId: string) {
  // don't send private user info because it's private and anyone can listen
  broadcast(`private-user/${userId}`, {})
}

export function broadcastUpdatedUser(user: Partial<User> & { id: string }) {
  broadcast(`user/${user.id}`, { user })
}

export function broadcastNewBets(
  contractId: string,
  visibility: Visibility,
  bets: Bet[]
) {
  const payload = { bets }
  broadcastMulti([`contract/${contractId}/new-bet`], payload)

  if (visibility === 'public') {
    broadcastMulti(['global', 'global/new-bet'], payload)
  }

  const newOrders = bets.filter((b) => b.limitProb && !b.isFilled) as LimitBet[]
  broadcastOrders(newOrders)
}

export function broadcastOrders(bets: LimitBet[]) {
  if (bets.length === 0) return
  const { contractId } = bets[0]
  broadcast(`contract/${contractId}/orders`, { bets })
}

export function broadcastNewComment(
  contractId: string,
  visibility: Visibility,
  creator: User,
  comment: ContractComment
) {
  const payload = { creator, comment }
  const topics = [`contract/${contractId}/new-comment`]
  if (visibility === 'public') {
    topics.push('global', 'global/new-comment')
  }
  broadcastMulti(topics, payload)
}

export function broadcastNewContract(contract: Contract, creator: User) {
  const payload = { contract, creator }
  if (contract.visibility === 'public') {
    broadcastMulti(['global', 'global/new-contract'], payload)
  }
}

export function broadcastNewSubsidy(
  contractId: string,
  visibility: Visibility,
  amount: number
) {
  const payload = { amount }
  const topics = [`contract/${contractId}/new-subsidy`]
  if (visibility === 'public') {
    topics.push('global', 'global/new-subsidy')
  }
  broadcastMulti(topics, payload)
}

export function broadcastUpdatedContract(
  visibility: Visibility,
  contract: Partial<Contract> & { id: string }
) {
  const payload = { contract }
  const topics = [`contract/${contract.id}`]
  if (visibility === 'public') {
    topics.push('global', 'global/updated-contract')
  }
  broadcastMulti(topics, payload)
}

export function broadcastNewAnswer(answer: Answer) {
  const payload = { answer }
  const topics = [`contract/${answer.contractId}/new-answer`]
  // TODO: broadcast to global. we don't do this rn cuz too lazy get contract visibility to filter out unlisted
  broadcastMulti(topics, payload)
}

export function broadcastUpdatedAnswers(
  contractId: string,
  answers: (Partial<Answer> & { id: string })[]
) {
  if (answers.length === 0) return

  const payload = { answers }
  const topics = [`contract/${contractId}/updated-answers`]
  // TODO: broadcast to global
  broadcastMulti(topics, payload)
}
```

We have our scripts in the directory `backend/scripts`.

We have a helper called `runScript` that automatically fetches any secret keys and loads them into process.env.

We recommend running scripts via `ts-node`. Example:

```sh
ts-node manicode.ts "Generate a page called cowp, which has cows that make noises!"
```

Our backend is mostly a set of endpoints. We create new endpoints by adding to the schema in `common/src/api/schema.ts`.

E.g. Here is the bet schema:
```ts
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
        limitProb: z.number().gte(0.01).lte(0.99).optional(),
        expiresAt: z.number().optional(),
        // Used for binary and new multiple choice contracts (cpmm-multi-1).
        outcome: z.enum(['YES', 'NO']).default('YES'),
        //Multi
        answerId: z.string().optional(),
        dryRun: z.boolean().optional(),
      })
      .strict(),
  },
```

Then, we define the bet endpoint in `backend/api/src/place-bet.ts`

```ts
export const placeBet: APIHandler<'bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'
  return await betsQueue.enqueueFn(
    () => placeBetMain(props, auth.uid, isApi),
    [props.contractId, auth.uid]
  )
}
```

And finally, you need to register the handler in `backend/api/src/app.ts`

```ts
import { placeBet } from './place-bet'
...

const handlers: { [k in APIPath]: APIHandler<k> } = {
  bet: placeBet,
  ...
}
```

    
  Here's our API schema. Each key-value pair in the below object corresponds to an endpoint.

E.g. 'comment' can be accessed at `api.manifold.markets/v0/comment`. If 'visibility' is 'public', then you need the '/v0', otherwise, you should omit the version. However, you probably don't need the url, you can use our library function `api('comment', props)`, or `useAPIGetter('comment', props)`
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
import { MAX_COMMENT_LENGTH, type ContractComment } from 'common/comment'
import { CandidateBet } from 'common/new-bet'
import type { Bet, LimitBet } from 'common/bet'
import { contentSchema } from 'common/api/zod-types'
import { Lover } from 'common/love/lover'
import { Contract } from 'common/contract'
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
import { ChatMessage } from 'common/chat-message'
import { PrivateUser, User } from 'common/user'
import { ManaSupply } from 'common/stats'
import { Repost } from 'common/repost'
import { adContract } from 'common/boost'
import { PERIODS } from 'common/period'
import {
  LivePortfolioMetrics,
  PortfolioMetrics,
} from 'common/portfolio-metrics'
import { ModReport } from '../mod-report'

import { RegistrationReturnType } from 'common/reason-codes'
import {
  GIDXDocument,
  GIDXMonitorResponse,
  GPSProps,
  verificationParams,
} from 'common/gidx/gidx'

import { notification_preference } from 'common/user-notification-preferences'

// mqp: very unscientific, just balancing our willingness to accept load
// with user willingness to put up with stale data
export const DEFAULT_CACHE_STRATEGY =
  'public, max-age=5, stale-while-revalidate=10'

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
    cache: DEFAULT_CACHE_STRATEGY,
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
        limitProb: z.number().gte(0.01).lte(0.99).optional(),
        expiresAt: z.number().optional(),
        // Used for binary and new multiple choice contracts (cpmm-multi-1).
        outcome: z.enum(['YES', 'NO']).default('YES'),
        //Multi
        answerId: z.string().optional(),
        dryRun: z.boolean().optional(),
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
        expiresAt: z.number().optional(),
        answerIds: z.array(z.string()).min(1),
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
        outcome: z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have
        answerId: z.string().optional(), // Required for multi binary markets
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
        userId: z.string().optional(),
        username: z.string().optional(),
        contractId: z.string().or(z.array(z.string())).optional(),
        contractSlug: z.string().optional(),
        answerId: z.string().optional(),
        // market: z.string().optional(), // deprecated, synonym for `contractSlug`
        limit: z.coerce.number().gte(0).lte(10000).default(10000),
        before: z.string().optional(),
        after: z.string().optional(),
        beforeTime: z.coerce.number().optional(),
        afterTime: z.coerce.number().optional(),
        order: z.enum(['asc', 'desc']).optional(),
        kinds: z.enum(['open-limit']).optional(),
        // undocumented fields. idk what a good api interface would be
        filterRedemptions: z.coerce.boolean().optional(),
        filterChallenges: z.coerce.boolean().optional(),
        filterAntes: z.coerce.boolean().optional(),
        includeZeroShareRedemptions: z.coerce.boolean().optional(),
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
    props: z.object({ slug: z.string() }),
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
      })
      .strict(),
  },
  'market/:id': {
    method: 'GET',
    visibility: 'public',
    authed: false,
    returns: {} as LiteMarket | FullMarket,
    cache: DEFAULT_CACHE_STRATEGY,
    props: z.object({ id: z.string(), lite: z.boolean().optional() }),
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
        token: z.enum(['M$', 'PP']).default('M$'),
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
  'get-related-markets-cache': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    props: z
      .object({
        contractId: z.string(),
        limit: z.coerce.number().gte(0).lte(100),
        embeddingsLimit: z.coerce.number().gte(0).lte(100),
        limitTopics: z.coerce.number().gte(0).lte(10),
        userId: z.string().optional(),
      })
      .strict(),
    returns: {} as {
      marketsFromEmbeddings: Contract[]
      marketsByTopicSlug: { [topicSlug: string]: Contract[] }
    },
    cache: 'public, max-age=3600, stale-while-revalidate=10',
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
  'get-ad-analytics': {
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
      redeemCount: number
      isBoosted: boolean
      totalFunds: number
      adCreatedTime: string
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
    returns: {} as { success: true },
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
  'get-feed': {
    method: 'GET',
    visibility: 'undocumented',
    authed: false,
    returns: {} as {
      contracts: Contract[]
      comments: ContractComment[]
      ads: adContract[]
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
    props: z.object({}).strict(),
    returns: {} as { status: string; reports: ModReport[] },
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
    },
    props: z.object({}),
  },
  'get-monitor-status-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: true,
    returns: {} as {
      status: string
      data: GIDXMonitorResponse
    },
    props: z.object({
      DeviceGPS: GPSProps,
    }),
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
  'callback-gidx': {
    method: 'POST',
    visibility: 'undocumented',
    authed: false,
    returns: {} as { Accepted: boolean },
    props: z.object({
      MerchantCustomerID: z.string(),
      NotificationType: z.string(),
    }),
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


    Here are all the code files in our project:
    backend/api/src/add-bounty.ts
backend/api/src/add-liquidity.ts
backend/api/src/add-topic-to-market.ts
backend/api/src/app.ts
backend/api/src/award-bounty.ts
backend/api/src/ban-user.ts
backend/api/src/block-group.ts
backend/api/src/block-market.ts
backend/api/src/block-user.ts
backend/api/src/boost-market.ts
backend/api/src/broadcast-test.ts
backend/api/src/cancel-bet.ts
backend/api/src/cancel-bounty.ts
backend/api/src/cast-poll-vote.ts
backend/api/src/claim-manalink.ts
backend/api/src/close-market.ts
backend/api/src/complete-quest.ts
backend/api/src/convert-sp-to-mana.ts
backend/api/src/create-answer-cpmm.ts
backend/api/src/create-chart-annotation.ts
backend/api/src/create-comment.ts
backend/api/src/create-dashboard.ts
backend/api/src/create-group.ts
backend/api/src/create-manalink.ts
backend/api/src/create-market.ts
backend/api/src/create-portfolio.ts
backend/api/src/create-private-user-message-channel.ts
backend/api/src/create-private-user-message.ts
backend/api/src/create-public-chat-message.ts
backend/api/src/create-user.ts
backend/api/src/delete-chart-annotation.ts
backend/api/src/delete-dashboard.ts
backend/api/src/delete-group.ts
backend/api/src/delete-market.ts
backend/api/src/delete-me.ts
backend/api/src/donate.ts
backend/api/src/edit-answer.ts
backend/api/src/edit-comment.ts
backend/api/src/fetch-link-preview.ts
backend/api/src/follow-dashboard.ts
backend/api/src/follow-topic.ts
backend/api/src/follow-user.ts
backend/api/src/get-ad-analytics.ts
backend/api/src/get-balance-changes.ts
backend/api/src/get-bets.ts
backend/api/src/get-comments.ts
backend/api/src/get-current-private-user.ts
backend/api/src/get-dashboard-from-slug.ts
backend/api/src/get-feed.ts
backend/api/src/get-followed-groups.ts
backend/api/src/get-group.ts
backend/api/src/get-groups.ts
backend/api/src/get-headlines.ts
backend/api/src/get-leagues.ts
backend/api/src/get-mana-summary-stats.ts
backend/api/src/get-mana-supply.ts
backend/api/src/get-managrams.ts
backend/api/src/get-market.ts
backend/api/src/get-me.ts
backend/api/src/get-mod-reports.ts
backend/api/src/get-news.ts
backend/api/src/get-partner-stats.ts
backend/api/src/get-positions.ts
backend/api/src/get-related-markets.ts
backend/api/src/get-seen-market-ids.ts
backend/api/src/get-similar-groups-to-contract.ts
backend/api/src/get-supabase-token.ts
backend/api/src/get-topics-with-markets.ts
backend/api/src/get-txn-summary-stats.ts
backend/api/src/get-unique-bet-groups.ts
backend/api/src/get-user-contract-metrics-with-contracts.ts
backend/api/src/get-user-is-group-member.ts
backend/api/src/get-user-portfolio-history.ts
backend/api/src/get-user-portfolio.ts
backend/api/src/get-user.ts
backend/api/src/get-users.ts
backend/api/src/get-your-dashboards.ts
backend/api/src/get-your-followed-dashboards.ts
backend/api/src/gidx/callback.ts
backend/api/src/gidx/get-monitor-status.ts
backend/api/src/gidx/get-verification-documents.ts
backend/api/src/gidx/get-verification-status.ts
backend/api/src/gidx/register.ts
backend/api/src/gidx/upload-document.ts
backend/api/src/health.ts
backend/api/src/helpers/debounce.ts
backend/api/src/helpers/endpoint.ts
backend/api/src/helpers/groups.ts
backend/api/src/helpers/on-create-market.ts
backend/api/src/helpers/on-create-user.ts
backend/api/src/helpers/rate-limit.ts
backend/api/src/hide-comment.ts
backend/api/src/league-activity.ts
backend/api/src/leave-private-user-message-channel.ts
backend/api/src/leave-review.ts
backend/api/src/love/compatible-lovers.ts
backend/api/src/love/create-comment-on-lover.ts
backend/api/src/love/create-love-compatibility-question.ts
backend/api/src/love/create-lover.ts
backend/api/src/love/get-compatibililty-questions.ts
backend/api/src/love/get-likes-and-ships.ts
backend/api/src/love/get-lover-answers.ts
backend/api/src/love/get-lovers.ts
backend/api/src/love/has-free-like.ts
backend/api/src/love/hide-comment-on-lover.ts
backend/api/src/love/like-lover.ts
backend/api/src/love/remove-pinned-photo.ts
backend/api/src/love/ship-lovers.ts
backend/api/src/love/star-lover.ts
backend/api/src/love/update-lover.ts
backend/api/src/manachan-tweet.ts
backend/api/src/managram.ts
backend/api/src/mark-all-notifications.ts
backend/api/src/markets.ts
backend/api/src/multi-sell.ts
backend/api/src/on-create-bet.ts
backend/api/src/on-create-comment-on-contract.ts
backend/api/src/on-update-liquidity-provision.ts
backend/api/src/pin-comment.ts
backend/api/src/place-bet.ts
backend/api/src/place-multi-bet.ts
backend/api/src/post.ts
backend/api/src/push-token.ts
backend/api/src/reaction.ts
backend/api/src/record-contract-interaction.ts
backend/api/src/record-contract-view.ts
backend/api/src/redeem-market-ad-reward.ts
backend/api/src/redeem-shares.ts
backend/api/src/refer-user.ts
backend/api/src/register-discord-id.ts
backend/api/src/report.ts
backend/api/src/request-loan.ts
backend/api/src/request-phone-otp.ts
backend/api/src/request-signup-bonus.ts
backend/api/src/resolve-market.ts
backend/api/src/save-topic.ts
backend/api/src/save-twitch-credentials.ts
backend/api/src/search-contract-positions.ts
backend/api/src/search-giphy.ts
backend/api/src/search-location.ts
backend/api/src/search-near-city.ts
backend/api/src/sell-shares.ts
backend/api/src/serve.ts
backend/api/src/set-news.ts
backend/api/src/set-tv.ts
backend/api/src/stripe-endpoints.ts
backend/api/src/supabase-search-contract.ts
backend/api/src/supabase-search-dashboards.ts
backend/api/src/supabase-search-groups.ts
backend/api/src/supabase-search-users.ts
backend/api/src/unlist-and-cancel-user-contracts.ts
backend/api/src/unresolve.ts
backend/api/src/unsubscribe.ts
backend/api/src/update-dashboard.ts
backend/api/src/update-group-member-role.ts
backend/api/src/update-group-privacy.ts
backend/api/src/update-group.ts
backend/api/src/update-market.ts
backend/api/src/update-me.ts
backend/api/src/update-mod-report.ts
backend/api/src/update-notif-settings.ts
backend/api/src/update-portfolio.ts
backend/api/src/update-private-user-message-channel.ts
backend/api/src/update-private-user.ts
backend/api/src/update-user-disinterests.ts
backend/api/src/update-user-embedding.ts
backend/api/src/validate-iap.ts
backend/api/src/verify-phone-number.ts
backend/functions/src/index.ts
backend/functions/src/scheduled/drizzle-liquidity.ts
backend/functions/src/scheduled/reset-betting-streaks.ts
backend/functions/src/scheduled/reset-quests-stats.ts
backend/functions/src/scheduled/weekly-portfolio-updates.ts
backend/scheduler/src/index.ts
backend/scheduler/src/jobs/auto-award-bounty.ts
backend/scheduler/src/jobs/clean-old-notifications.ts
backend/scheduler/src/jobs/denormalize-answers.ts
backend/scheduler/src/jobs/helpers.ts
backend/scheduler/src/jobs/increment-streak-forgiveness.ts
backend/scheduler/src/jobs/index.ts
backend/scheduler/src/jobs/poll-poll-resolutions.ts
backend/scheduler/src/jobs/reindex-table.ts
backend/scheduler/src/jobs/reset-pg-stats.ts
backend/scheduler/src/jobs/reset-weekly-emails-flags.ts
backend/scheduler/src/jobs/score-contracts.ts
backend/scheduler/src/jobs/send-market-close-emails.ts
backend/scheduler/src/jobs/streak-expiration-notice.ts
backend/scheduler/src/jobs/update-contract-view-embeddings.ts
backend/scheduler/src/jobs/update-league-ranks.ts
backend/scheduler/src/jobs/update-league.ts
backend/scheduler/src/jobs/update-stats.ts
backend/scheduler/src/utils.ts
backend/scripts/backfill-unique-bettors-day.ts
backend/scripts/manicode.ts
backend/shared/src/analytics.ts
backend/shared/src/audit-events.ts
backend/shared/src/backfill-user-topic-interests.ts
backend/shared/src/bounty.ts
backend/shared/src/calculate-calibration.ts
backend/shared/src/calculate-mana-stats.ts
backend/shared/src/calculate-user-topic-interests.ts
backend/shared/src/check-push-receipts.ts
backend/shared/src/complete-quest-internal.ts
backend/shared/src/conversion-score.ts
backend/shared/src/create-love-notification.ts
backend/shared/src/create-mod-report.ts
backend/shared/src/create-notification.ts
backend/shared/src/create-push-notification.ts
backend/shared/src/emails.ts
backend/shared/src/expire-limit-orders.ts
backend/shared/src/fb-analytics.ts
backend/shared/src/feed-analytics.ts
backend/shared/src/follow-market.ts
backend/shared/src/generate-leagues.ts
backend/shared/src/get-user-portfolio-internal.ts
backend/shared/src/gidx/helpers.ts
backend/shared/src/group-importance-score.ts
backend/shared/src/helpers/add-house-subsidy.ts
backend/shared/src/helpers/auth.ts
backend/shared/src/helpers/claude.ts
backend/shared/src/helpers/embeddings.ts
backend/shared/src/helpers/file.ts
backend/shared/src/helpers/fn-queue.ts
backend/shared/src/helpers/generate-and-update-avatar-urls.ts
backend/shared/src/helpers/get-phone-number.ts
backend/shared/src/helpers/openai-utils.ts
backend/shared/src/helpers/portfolio.ts
backend/shared/src/helpers/search.ts
backend/shared/src/helpers/seen-markets.ts
backend/shared/src/helpers/try-or-log-error.ts
backend/shared/src/helpers/user-contract-metrics.ts
backend/shared/src/importance-score.ts
backend/shared/src/init-admin.ts
backend/shared/src/init-caches.ts
backend/shared/src/love/love-markets.ts
backend/shared/src/love/parse-photos.ts
backend/shared/src/love/supabase.ts
backend/shared/src/mana-supply.ts
backend/shared/src/monitoring/context.ts
backend/shared/src/monitoring/instance-info.ts
backend/shared/src/monitoring/log.ts
backend/shared/src/monitoring/metric-writer.ts
backend/shared/src/monitoring/metrics.ts
backend/shared/src/onboarding-helpers.ts
backend/shared/src/payout-leagues.ts
backend/shared/src/record-contract-edit.ts
backend/shared/src/resolve-market-helpers.ts
backend/shared/src/send-email.ts
backend/shared/src/short-transaction.ts
backend/shared/src/supabase/answers.ts
backend/shared/src/supabase/bets.ts
backend/shared/src/supabase/channel.ts
backend/shared/src/supabase/contract_comments.ts
backend/shared/src/supabase/contracts.ts
backend/shared/src/supabase/dashboard.ts
backend/shared/src/supabase/groups.ts
backend/shared/src/supabase/init.ts
backend/shared/src/supabase/leagues.ts
backend/shared/src/supabase/likes.ts
backend/shared/src/supabase/liquidity.ts
backend/shared/src/supabase/notifications.ts
backend/shared/src/supabase/portfolio-metrics.ts
backend/shared/src/supabase/private-messages.ts
backend/shared/src/supabase/reposts.ts
backend/shared/src/supabase/search-contracts.ts
backend/shared/src/supabase/sql-builder.ts
backend/shared/src/supabase/users.ts
backend/shared/src/supabase/utils.ts
backend/shared/src/supabase/vectors.ts
backend/shared/src/test-backend-function.ts
backend/shared/src/tiptap.ts
backend/shared/src/topic-interests.ts
backend/shared/src/twitter.ts
backend/shared/src/txn/run-bounty-txn.ts
backend/shared/src/txn/run-txn.ts
backend/shared/src/update-contract-metrics-core.ts
backend/shared/src/update-creator-metrics-core.ts
backend/shared/src/update-group-contracts-internal.ts
backend/shared/src/update-group-metrics-core.ts
backend/shared/src/update-user-metrics-core.ts
backend/shared/src/utils.ts
backend/shared/src/websockets/helpers.ts
backend/shared/src/websockets/server.ts
backend/shared/src/websockets/switchboard.ts
backend/shared/src/weekly-markets-emails.ts
backend/shared/src/weekly-portfolio-emails.ts
common/src/add-liquidity.ts
common/src/answer.ts
common/src/antes.ts
common/src/api/love-types.ts
common/src/api/market-search-types.ts
common/src/api/market-types.ts
common/src/api/schema.ts
common/src/api/user-types.ts
common/src/api/utils.ts
common/src/api/websocket-client.ts
common/src/api/websockets.ts
common/src/api/zod-types.ts
common/src/balance-change.ts
common/src/bet.ts
common/src/bid.ts
common/src/boost.ts
common/src/bounty.ts
common/src/calculate-cpmm-arbitrage.test.ts
common/src/calculate-cpmm-arbitrage.ts
common/src/calculate-cpmm.ts
common/src/calculate-fixed-payouts.ts
common/src/calculate-metrics.ts
common/src/calculate.ts
common/src/can-send-mana.ts
common/src/charity.ts
common/src/chart-position.ts
common/src/chart.ts
common/src/chat-message.ts
common/src/comment.ts
common/src/contract-metric.ts
common/src/contract-params.ts
common/src/contract-seo.ts
common/src/contract.ts
common/src/dashboard.ts
common/src/destiny-sub.ts
common/src/economy.ts
common/src/edge/og.ts
common/src/envs/constants.ts
common/src/envs/dev.ts
common/src/envs/prod.ts
common/src/events.ts
common/src/feed.ts
common/src/fees.ts
common/src/firebase-auth.ts
common/src/follow.ts
common/src/gidx/gidx.ts
common/src/group-invite.ts
common/src/group-member.ts
common/src/group.ts
common/src/iap.ts
common/src/leagues.ts
common/src/like.ts
common/src/link-preview.ts
common/src/liquidity-provision.ts
common/src/loans.ts
common/src/love/compatibility-score.ts
common/src/love/compatibility-util.ts
common/src/love/constants.ts
common/src/love/love-comment.ts
common/src/love/lover.ts
common/src/love/multiple-choice.ts
common/src/love/og-image.ts
common/src/mod-report.ts
common/src/multi-numeric.ts
common/src/native-message.ts
common/src/native-share-data.ts
common/src/new-bet.ts
common/src/new-contract.ts
common/src/news.ts
common/src/notification.ts
common/src/numeric-constants.ts
common/src/partner.ts
common/src/payouts-fixed.ts
common/src/payouts.ts
common/src/period.ts
common/src/poll-option.ts
common/src/portfolio-metrics.ts
common/src/portfolio.ts
common/src/pseudo-numeric.ts
common/src/push-ticket.ts
common/src/quest.ts
common/src/reaction.ts
common/src/reason-codes.ts
common/src/recommendation.ts
common/src/redeem.ts
common/src/report.ts
common/src/repost.ts
common/src/secrets.ts
common/src/sell-bet.ts
common/src/stats.ts
common/src/stonk.ts
common/src/supabase/analytics.ts
common/src/supabase/answers.ts
common/src/supabase/bets.ts
common/src/supabase/bounties.ts
common/src/supabase/chart-annotations.ts
common/src/supabase/comments.ts
common/src/supabase/contract-metrics.ts
common/src/supabase/contracts.ts
common/src/supabase/dashboard-follows.ts
common/src/supabase/dashboards.ts
common/src/supabase/group-invites.ts
common/src/supabase/groups.ts
common/src/supabase/is-admin.ts
common/src/supabase/leagues.ts
common/src/supabase/liquidity.ts
common/src/supabase/notifications.ts
common/src/supabase/portfolio-metrics.ts
common/src/supabase/realtime.ts
common/src/supabase/referrals.ts
common/src/supabase/schema.ts
common/src/supabase/set-scores.ts
common/src/supabase/txns.ts
common/src/supabase/users.ts
common/src/supabase/utils.ts
common/src/tier.ts
common/src/topics.ts
common/src/tracking.ts
common/src/txn.ts
common/src/user-notification-preferences.ts
common/src/user.ts
common/src/util/adjective-animal.ts
common/src/util/algos.ts
common/src/util/api.ts
common/src/util/array.ts
common/src/util/assert.ts
common/src/util/clean-username.ts
common/src/util/color.ts
common/src/util/format.ts
common/src/util/json.ts
common/src/util/math.ts
common/src/util/matrix.ts
common/src/util/object.ts
common/src/util/og.ts
common/src/util/parse.ts
common/src/util/promise.ts
common/src/util/random.ts
common/src/util/share.ts
common/src/util/slugify.ts
common/src/util/string.ts
common/src/util/time.ts
common/src/util/tiptap-iframe.ts
common/src/util/tiptap-spoiler.ts
common/src/util/tiptap-tweet.ts
common/src/util/types.ts
common/src/weekly-portfolio-update.ts
native/components/custom-webview.tsx
web/components/LogoSEO.tsx
web/components/NoSEO.tsx
web/components/SEO.tsx
web/components/SuperBanControl.tsx
web/components/activity-log.tsx
web/components/ad/claim-ad-button.tsx
web/components/add-funds-modal.tsx
web/components/annotate-chart.tsx
web/components/answers/answer-bet-panel.tsx
web/components/answers/answer-components.tsx
web/components/answers/answer-resolve-panel.tsx
web/components/answers/answers-panel.tsx
web/components/answers/binary-multi-answers-panel.tsx
web/components/answers/create-answer-panel.tsx
web/components/answers/multiple-choice-answers.tsx
web/components/answers/numeric-bet-panel.tsx
web/components/answers/numeric-sell-panel.tsx
web/components/answers/small-answer.tsx
web/components/auth-context.tsx
web/components/bet/bet-dialog.tsx
web/components/bet/bet-panel.tsx
web/components/bet/bet-slider.tsx
web/components/bet/bet-summary.tsx
web/components/bet/contract-bets-table.tsx
web/components/bet/feed-bet-button.tsx
web/components/bet/fees.tsx
web/components/bet/limit-order-panel.tsx
web/components/bet/numeric-bet-button.tsx
web/components/bet/order-book.tsx
web/components/bet/quick-limit-order-buttons.tsx
web/components/bet/sell-panel.tsx
web/components/bet/sell-row.tsx
web/components/bet/user-bets-table.tsx
web/components/bet/yes-no-selector.tsx
web/components/buttons/app-badges-or-get-app-button.tsx
web/components/buttons/block-market-button.tsx
web/components/buttons/button.tsx
web/components/buttons/confirmation-button.tsx
web/components/buttons/copy-link-button.tsx
web/components/buttons/create-question-button.tsx
web/components/buttons/delete-market-button.tsx
web/components/buttons/duplicate-contract-button.tsx
web/components/buttons/file-upload-button.tsx
web/components/buttons/follow-button.tsx
web/components/buttons/follow-market-button.tsx
web/components/buttons/mobile-apps-qr-code-button.tsx
web/components/buttons/more-options-user-button.tsx
web/components/buttons/pill-button.tsx
web/components/buttons/referrals-button.tsx
web/components/buttons/report-button.tsx
web/components/buttons/scroll-to-top-button.tsx
web/components/buttons/share-embed-button.tsx
web/components/buttons/share-qr-button.tsx
web/components/buttons/sign-up-button.tsx
web/components/buttons/text-button.tsx
web/components/buttons/tweet-button.tsx
web/components/buttons/unresolve-button.tsx
web/components/buttons/warning-confirmation-button.tsx
web/components/buy-mana-button.tsx
web/components/cards/MarketCard.tsx
web/components/cards/UserCard.tsx
web/components/charity/charity-card.tsx
web/components/charity/feed-items.tsx
web/components/charts/calibration.tsx
web/components/charts/chart-annotations.tsx
web/components/charts/contract/binary.tsx
web/components/charts/contract/choice.tsx
web/components/charts/contract/depth-chart.tsx
web/components/charts/contract/multi-numeric.tsx
web/components/charts/contract/pseudo-numeric.tsx
web/components/charts/contract/single-value.tsx
web/components/charts/contract/stonk.tsx
web/components/charts/contract/zoom-utils.ts
web/components/charts/generic-charts.tsx
web/components/charts/helpers.tsx
web/components/charts/mana-spice-chart.tsx
web/components/charts/minibar.tsx
web/components/charts/stats.tsx
web/components/charts/time-range-picker.tsx
web/components/charts/user-position-search-button.tsx
web/components/charts/zoom-slider.tsx
web/components/chat/chat-input.tsx
web/components/chat/chat-message.tsx
web/components/chat/public-chat.tsx
web/components/client-render.tsx
web/components/clock/clock.tsx
web/components/clock/digit.tsx
web/components/clock/display.tsx
web/components/clock/segment-style.ts
web/components/clock/segment.tsx
web/components/comments/comment-edit-history-button.tsx
web/components/comments/comment-input.tsx
web/components/comments/comments-button.tsx
web/components/comments/comments-list.tsx
web/components/comments/dropdown-button-menu.tsx
web/components/comments/dropdown-menu.tsx
web/components/comments/edit-comment-modal.tsx
web/components/comments/reply-toggle.tsx
web/components/comments/repost-modal.tsx
web/components/confetti-on-demand.tsx
web/components/contract/add-liquidity-button.tsx
web/components/contract/back-button.tsx
web/components/contract/boost-button.tsx
web/components/contract/bountied-question.tsx
web/components/contract/change-banner-button.tsx
web/components/contract/contract-description.tsx
web/components/contract/contract-details.tsx
web/components/contract/contract-edit-history-button.tsx
web/components/contract/contract-info-dialog.tsx
web/components/contract/contract-leaderboard.tsx
web/components/contract/contract-mention.tsx
web/components/contract/contract-overview.tsx
web/components/contract/contract-price.tsx
web/components/contract/contract-seo.tsx
web/components/contract/contract-share-panel.tsx
web/components/contract/contract-summary-stats.tsx
web/components/contract/contract-table-action.tsx
web/components/contract/contract-table-col-formats.tsx
web/components/contract/contract-tabs.tsx
web/components/contract/contracts-grid.tsx
web/components/contract/contracts-table.tsx
web/components/contract/creator-fees-display.tsx
web/components/contract/creator-share-panel.tsx
web/components/contract/danger-zone.tsx
web/components/contract/editable-mod-note.tsx
web/components/contract/editable-payment-info.tsx
web/components/contract/editable-question-title.tsx
web/components/contract/featured-contract-badge.tsx
web/components/contract/feed-contract-card.tsx
web/components/contract/header-actions.tsx
web/components/contract/like-button.tsx
web/components/contract/liquidity-modal.tsx
web/components/contract/market-topics.tsx
web/components/contract/related-contracts-widget.tsx
web/components/contract/subsidize-button.tsx
web/components/contract/text-color.ts
web/components/contract/tip-button.tsx
web/components/contract/trades-button.tsx
web/components/contract/upgrade-tier-button.tsx
web/components/contract/user-positions-table.tsx
web/components/contract/watch-market-modal.tsx
web/components/contract-select-modal.tsx
web/components/country-code-selector.tsx
web/components/dashboard/add-dashboard-item.tsx
web/components/dashboard/create-dashboard-button.tsx
web/components/dashboard/dashboard-add-contract.tsx
web/components/dashboard/dashboard-add-link.tsx
web/components/dashboard/dashboard-cards.tsx
web/components/dashboard/dashboard-content.tsx
web/components/dashboard/dashboard-page.tsx
web/components/dashboard/dashboard-search.tsx
web/components/dashboard/dashboard-set-topics.tsx
web/components/dashboard/dashboard-text-card.tsx
web/components/dashboard/follow-dashboard-button.tsx
web/components/dashboard/header.tsx
web/components/dashboard/horizontal-dashboard-card.tsx
web/components/dashboard/horizontal-dashboard.tsx
web/components/dashboard/input-with-limit.tsx
web/components/dashboard/multi-dashboard-header.tsx
web/components/dashboard/politics-dashboard-page.tsx
web/components/donut-chart.tsx
web/components/editor/contract-mention/contract-mention-extension.tsx
web/components/editor/contract-mention/contract-mention-list.tsx
web/components/editor/contract-mention/contract-mention-suggestion.ts
web/components/editor/embed-modal.tsx
web/components/editor/emoji/emoji-extension.ts
web/components/editor/emoji/emoji-list.tsx
web/components/editor/emoji/emoji-suggestion.ts
web/components/editor/floating-format-menu.tsx
web/components/editor/gif-modal.tsx
web/components/editor/image.tsx
web/components/editor/link-preview-extension.tsx
web/components/editor/link-preview-node-view.tsx
web/components/editor/market-modal.tsx
web/components/editor/nodeview-middleware.tsx
web/components/editor/spoiler.tsx
web/components/editor/sticky-format-menu.tsx
web/components/editor/tiptap-grid-cards.tsx
web/components/editor/tweet.tsx
web/components/editor/upload-extension.tsx
web/components/editor/user-mention/mention-extension.tsx
web/components/editor/user-mention/mention-list.tsx
web/components/editor/user-mention/mention-suggestion.ts
web/components/editor/user-mention/user-mention.tsx
web/components/editor/utils.ts
web/components/elections-page.tsx
web/components/explainer-panel.tsx
web/components/feed/card-dropdown.tsx
web/components/feed/card-reason.tsx
web/components/feed/comment-on-answer.tsx
web/components/feed/copy-link-date-time.tsx
web/components/feed/feed-bets.tsx
web/components/feed/feed-chart.tsx
web/components/feed/feed-comments.tsx
web/components/feed/feed-contract-card-description.tsx
web/components/feed/feed-liquidity.tsx
web/components/feed/feed-multi-numeric-bet-group.tsx
web/components/feed/live-generated-feed.tsx
web/components/feed/scored-feed-repost-item.tsx
web/components/follow-list.tsx
web/components/gidx/register-user-form.tsx
web/components/gidx/upload-document.tsx
web/components/gidx/verify-me.tsx
web/components/home/daily-league-stat.tsx
web/components/home/daily-loan.tsx
web/components/home/daily-profit.tsx
web/components/home/daily-stats.tsx
web/components/home/quests-or-streak.tsx
web/components/home/typewriter.tsx
web/components/home/welcome-topic-sections.tsx
web/components/icons/logo-icon.tsx
web/components/icons/mana-circle-icon.tsx
web/components/layout/col.tsx
web/components/layout/modal.tsx
web/components/layout/page.tsx
web/components/layout/right-modal.tsx
web/components/layout/row.tsx
web/components/layout/spacer.tsx
web/components/layout/tabs.tsx
web/components/leaderboard.tsx
web/components/leagues/cohort-table.tsx
web/components/leagues/league-bid-panel.tsx
web/components/leagues/league-feed.tsx
web/components/leagues/mana-earned-breakdown.tsx
web/components/leagues/prizes-modal.tsx
web/components/loading-user-rows.tsx
web/components/manalink-card.tsx
web/components/manalinks/create-links-button.tsx
web/components/messaging/messages-icon.tsx
web/components/messaging/new-message-button.tsx
web/components/messaging/send-message-button.tsx
web/components/mod-report-item.tsx
web/components/multi-checkbox.tsx
web/components/multi-user-reaction-link.tsx
web/components/multi-user-transaction-link.tsx
web/components/multiple-or-single-avatars.tsx
web/components/native-message-listener.tsx
web/components/nav/banner.tsx
web/components/nav/bottom-nav-bar.tsx
web/components/nav/manifold-logo.tsx
web/components/nav/more-button.tsx
web/components/nav/profile-summary.tsx
web/components/nav/sidebar-item.tsx
web/components/nav/sidebar.tsx
web/components/new-contract/choosing-contract-form.tsx
web/components/new-contract/close-time-section.tsx
web/components/new-contract/contract-params-form.tsx
web/components/new-contract/cost-section.tsx
web/components/new-contract/create-contract-types.tsx
web/components/new-contract/multi-numeric-range-section.tsx
web/components/new-contract/new-contract-panel.tsx
web/components/new-contract/pseudo-numeric-range-section.tsx
web/components/new-contract/similar-contracts-section.tsx
web/components/new-contract/topic-selector-section.tsx
web/components/new-contract-badge.tsx
web/components/news/dashboard-news-item.tsx
web/components/news/edit-news-button.tsx
web/components/news/news-article.tsx
web/components/notification-settings.tsx
web/components/notifications/income-summary-notifications.tsx
web/components/notifications/notification-dropdown.tsx
web/components/notifications/notification-helpers.tsx
web/components/notifications/notification-types.tsx
web/components/notifications/watched-markets.tsx
web/components/notifications-icon.tsx
web/components/numeric-resolution-panel.tsx
web/components/og/graph.tsx
web/components/og/og-market.tsx
web/components/og/og-weekly-update.tsx
web/components/og/utils.tsx
web/components/onboarding/welcome.tsx
web/components/onboarding-verify-phone.tsx
web/components/outcome-label.tsx
web/components/play-money-disclaimer.tsx
web/components/poll/poll-panel.tsx
web/components/portfolio/balance-change-table.tsx
web/components/portfolio/portfolio-chart.tsx
web/components/portfolio/portfolio-graph-number.tsx
web/components/portfolio/portfolio-summary.tsx
web/components/portfolio/portfolio-tabs.tsx
web/components/portfolio/portfolio-value-graph.tsx
web/components/portfolio/portfolio-value-section.tsx
web/components/portfolio/profit-widget.tsx
web/components/portfolio/stacked-data-area.tsx
web/components/preview/preview-yes-no-selector.tsx
web/components/privacy-terms.tsx
web/components/profile/add-funds-button.tsx
web/components/profile/betting-streak-modal.tsx
web/components/profile/block-user.tsx
web/components/profile/blocked-user.tsx
web/components/profile/delete-yourself.tsx
web/components/profile/loans-modal.tsx
web/components/profile/redeem-spice-button.tsx
web/components/profile/report-user.tsx
web/components/profile/settings.tsx
web/components/profile/user-contracts-list.tsx
web/components/profile/user-liked-contracts-button.tsx
web/components/profit-badge.tsx
web/components/progress-bar.tsx
web/components/push-notifications-modal.tsx
web/components/redeem-spice-modal.tsx
web/components/registration-verify-phone.tsx
web/components/relative-timestamp.tsx
web/components/reports-icon.tsx
web/components/resolution-panel.tsx
web/components/reviews/review.tsx
web/components/reviews/stars.tsx
web/components/reviews/user-reviews.tsx
web/components/search/contract-filters.tsx
web/components/search/filter-pills.tsx
web/components/search/query-topics.ts
web/components/search/search-dropdown-helpers.tsx
web/components/search/user-results.tsx
web/components/select-users.tsx
web/components/sign-up-prompt.tsx
web/components/simple-contract-row.tsx
web/components/sized-container.tsx
web/components/stats/bonus-summary.tsx
web/components/stats/mana-summary.tsx
web/components/styles/colors.tsx
web/components/supabase-search.tsx
web/components/switch-setting.tsx
web/components/testimonials-panel.tsx
web/components/tiers/tier-tooltip.tsx
web/components/topics/add-contract-to-group-modal.tsx
web/components/topics/add-market-modal.tsx
web/components/topics/browse-topic-pills.tsx
web/components/topics/contract-topics-list.tsx
web/components/topics/create-topic-modal.tsx
web/components/topics/delete-topic-modal.tsx
web/components/topics/editable-topic-name.tsx
web/components/topics/questions-topic-title.tsx
web/components/topics/topic-dropdown.tsx
web/components/topics/topic-options.tsx
web/components/topics/topic-privacy-modal.tsx
web/components/topics/topic-selector.tsx
web/components/topics/topic-tag.tsx
web/components/topics/topics-button.tsx
web/components/topics/your-topics.tsx
web/components/trust-panel.tsx
web/components/tv/schedule-tv-modal.tsx
web/components/tv/tv-display.tsx
web/components/tv/tv-page.tsx
web/components/tv/tv-schedule-page.tsx
web/components/tv/tv-schedule.ts
web/components/tv-icon.tsx
web/components/us-elections/ candidates/candidate-data.ts
web/components/us-elections/article.tsx
web/components/us-elections/contracts/candidates-panel/candidate-bar.tsx
web/components/us-elections/contracts/candidates-panel/candidates-panel.tsx
web/components/us-elections/contracts/candidates-panel/candidates-user-position.tsx
web/components/us-elections/contracts/candidates-panel/small-candidate-bar.tsx
web/components/us-elections/contracts/candidates-panel/small-candidate-panel.tsx
web/components/us-elections/contracts/choice-mini-graph.tsx
web/components/us-elections/contracts/conditional-market/conditional-market.tsx
web/components/us-elections/contracts/conditional-market/conditional-markets.tsx
web/components/us-elections/contracts/party-panel/party-panel.tsx
web/components/us-elections/contracts/politics-card.tsx
web/components/us-elections/contracts/state-contract-card.tsx
web/components/us-elections/contracts/which-party-card.tsx
web/components/usa-map/electoral-college-visual.tsx
web/components/usa-map/governor-state.tsx
web/components/usa-map/homepage-map.tsx
web/components/usa-map/house-bar.tsx
web/components/usa-map/house-table-helpers.tsx
web/components/usa-map/house-table.tsx
web/components/usa-map/presidential-state.tsx
web/components/usa-map/senate-bar.tsx
web/components/usa-map/senate-state.tsx
web/components/usa-map/state-contract.tsx
web/components/usa-map/state-election-map.tsx
web/components/usa-map/usa-map-data.ts
web/components/usa-map/usa-map.tsx
web/components/usa-map/usa-state.tsx
web/components/user/user-handles.tsx
web/components/user/user-hovercard.tsx
web/components/user/verify-phone-number-banner.tsx
web/components/user-from-id.tsx
web/components/widgets/alert-box.tsx
web/components/widgets/amount-input.tsx
web/components/widgets/avatar.tsx
web/components/widgets/bucket-input.tsx
web/components/widgets/card.tsx
web/components/widgets/carousel.tsx
web/components/widgets/checkbox.tsx
web/components/widgets/checked-dropdown.tsx
web/components/widgets/choices-toggle-group.tsx
web/components/widgets/click-frame.tsx
web/components/widgets/collapsible-content.tsx
web/components/widgets/container.tsx
web/components/widgets/countdown.tsx
web/components/widgets/customizeable-dropdown.tsx
web/components/widgets/datetime-tooltip.tsx
web/components/widgets/edit-in-place.tsx
web/components/widgets/editor.tsx
web/components/widgets/expandable-content.tsx
web/components/widgets/expanding-input.tsx
web/components/widgets/external-link.tsx
web/components/widgets/fullscreen-confetti.tsx
web/components/widgets/gradient-container.tsx
web/components/widgets/icon-toggle.tsx
web/components/widgets/image-with-blurred-shadow.tsx
web/components/widgets/increment-button.tsx
web/components/widgets/info-box.tsx
web/components/widgets/info-tooltip.tsx
web/components/widgets/input.tsx
web/components/widgets/linkify.tsx
web/components/widgets/loading-indicator.tsx
web/components/widgets/manaCoinNumber.tsx
web/components/widgets/news-topics-content-container.tsx
web/components/widgets/pagination.tsx
web/components/widgets/probability-input.tsx
web/components/widgets/qr-code.tsx
web/components/widgets/radio-toggle-group.tsx
web/components/widgets/select.tsx
web/components/widgets/short-toggle.tsx
web/components/widgets/site-link.tsx
web/components/widgets/slider.tsx
web/components/widgets/subtitle.tsx
web/components/widgets/table.tsx
web/components/widgets/title.tsx
web/components/widgets/toast-clipboard.tsx
web/components/widgets/tooltip.tsx
web/components/widgets/truncate.tsx
web/components/widgets/user-link.tsx
web/components/widgets/visibility-observer.tsx
web/hooks/use-ab-test.ts
web/hooks/use-ad-timer.ts
web/hooks/use-additional-feed-items.ts
web/hooks/use-admin.ts
web/hooks/use-animated-number.ts
web/hooks/use-answers.ts
web/hooks/use-api-getter.ts
web/hooks/use-api-subscription.ts
web/hooks/use-async-data.ts
web/hooks/use-bets.ts
web/hooks/use-boosts.ts
web/hooks/use-bounties.ts
web/hooks/use-browser-os.ts
web/hooks/use-call-refer-user.ts
web/hooks/use-can-send-mana.ts
web/hooks/use-chart-annotations.ts
web/hooks/use-chart-positions.ts
web/hooks/use-comments.ts
web/hooks/use-contract.ts
web/hooks/use-dashboard-follows.ts
web/hooks/use-dashboard.ts
web/hooks/use-debounced-effect.ts
web/hooks/use-defined-search-params.ts
web/hooks/use-editable-user-info.ts
web/hooks/use-effect-check-equality.ts
web/hooks/use-event.ts
web/hooks/use-focus.ts
web/hooks/use-follows.ts
web/hooks/use-force-update.ts
web/hooks/use-getter.ts
web/hooks/use-google-analytics.ts
web/hooks/use-group-supabase.ts
web/hooks/use-has-loaded.ts
web/hooks/use-has-received-loan.ts
web/hooks/use-has-seen-contracts.ts
web/hooks/use-hash-in-url-page-router.ts
web/hooks/use-hash-in-url.ts
web/hooks/use-header-is-stuck.ts
web/hooks/use-intersection.ts
web/hooks/use-is-advanced-trader.ts
web/hooks/use-is-client.ts
web/hooks/use-is-eligible-for-loans.ts
web/hooks/use-is-iframe.ts
web/hooks/use-is-mobile.ts
web/hooks/use-is-visible.ts
web/hooks/use-leagues.ts
web/hooks/use-likes.ts
web/hooks/use-link-previews.ts
web/hooks/use-liquidity.ts
web/hooks/use-long-touch.ts
web/hooks/use-mana-payments.ts
web/hooks/use-measure-size.ts
web/hooks/use-mod-reports.ts
web/hooks/use-multi-dashboard.ts
web/hooks/use-mutation.ts
web/hooks/use-native-messages.ts
web/hooks/use-notifications.ts
web/hooks/use-page-visible.ts
web/hooks/use-pagination.ts
web/hooks/use-partial-updater.ts
web/hooks/use-persistent-in-memory-state.ts
web/hooks/use-persistent-local-state.ts
web/hooks/use-persistent-query-state.ts
web/hooks/use-persistent-state.ts
web/hooks/use-persistent-supabase-polling.ts
web/hooks/use-portfolio-history.ts
web/hooks/use-portfolios.ts
web/hooks/use-previous.ts
web/hooks/use-private-messages.ts
web/hooks/use-public-chat-messages.ts
web/hooks/use-query.ts
web/hooks/use-quest-status.ts
web/hooks/use-recent-unique-bettors.ts
web/hooks/use-redirect-if-signed-in.ts
web/hooks/use-redirect-if-signed-out.ts
web/hooks/use-referrals.ts
web/hooks/use-refresh-all-clients.ts
web/hooks/use-related-contracts.ts
web/hooks/use-request-new-user-signup-bonus.ts
web/hooks/use-review.ts
web/hooks/use-safe-layout-effect.ts
web/hooks/use-save-binary-shares.ts
web/hooks/use-save-campaign.ts
web/hooks/use-save-referral.ts
web/hooks/use-save-scroll.ts
web/hooks/use-save-visits.ts
web/hooks/use-saved-contract-metrics.ts
web/hooks/use-state-check-equality.ts
web/hooks/use-store.ts
web/hooks/use-theme.ts
web/hooks/use-topic-from-router.ts
web/hooks/use-tracking.ts
web/hooks/use-user-bets.ts
web/hooks/use-user-supabase.ts
web/hooks/use-user.ts
web/hooks/use-users.ts
web/hooks/use-votes.ts
web/hooks/use-warn-unsaved-changes.ts
web/hooks/use-window-size.ts
web/hooks/use-your-daily-changed-contracts.ts
web/lib/api/api-key.ts
web/lib/api/api.ts
web/lib/api/cors.ts
web/lib/api/proxy.ts
web/lib/firebase/google-onetap-login.tsx
web/lib/firebase/init.ts
web/lib/firebase/server-auth.ts
web/lib/firebase/storage.ts
web/lib/firebase/users.ts
web/lib/native/is-native.ts
web/lib/native/native-messages.ts
web/lib/native/post-message.ts
web/lib/politics/home.ts
web/lib/politics/news-dashboard.ts
web/lib/service/analytics.ts
web/lib/service/stripe.ts
web/lib/supabase/admin-db.ts
web/lib/supabase/ads.ts
web/lib/supabase/answers.ts
web/lib/supabase/bets.ts
web/lib/supabase/chat-messages.ts
web/lib/supabase/comments.ts
web/lib/supabase/contracts.ts
web/lib/supabase/dashboards.ts
web/lib/supabase/db.ts
web/lib/supabase/feed-timeline/feed-market-movement-display.ts
web/lib/supabase/follows.ts
web/lib/supabase/group.ts
web/lib/supabase/groups.ts
web/lib/supabase/leagues.ts
web/lib/supabase/liquidity.ts
web/lib/supabase/manalinks.ts
web/lib/supabase/notifications.ts
web/lib/supabase/polls.ts
web/lib/supabase/portfolio-history.ts
web/lib/supabase/portfolio.ts
web/lib/supabase/private-messages.ts
web/lib/supabase/reactions.ts
web/lib/supabase/realtime/use-broadcast.ts
web/lib/supabase/realtime/use-channel.ts
web/lib/supabase/realtime/use-postgres-changes.ts
web/lib/supabase/realtime/use-subscription.ts
web/lib/supabase/referrals.ts
web/lib/supabase/reviews.ts
web/lib/supabase/stats.ts
web/lib/supabase/super-ban-user.ts
web/lib/supabase/txns.ts
web/lib/supabase/user-events.ts
web/lib/supabase/users.ts
web/lib/twitch/link-twitch-account.ts
web/lib/util/cookie.ts
web/lib/util/copy.ts
web/lib/util/device.ts
web/lib/util/formatNumber.ts
web/lib/util/local.ts
web/lib/util/minMax.ts
web/lib/util/roundToNearestFive.ts
web/lib/util/scroll.ts
web/lib/util/shortenedFromNow.ts
web/lib/util/time.ts
web/middleware.ts
web/pages/404.tsx
web/pages/[username]/[contractSlug].tsx
web/pages/[username]/calibration.tsx
web/pages/[username]/index.tsx
web/pages/[username]/partner.tsx
web/pages/_app.tsx
web/pages/_document.tsx
web/pages/about.tsx
web/pages/add-funds.tsx
web/pages/admin/index.tsx
web/pages/admin/journeys.tsx
web/pages/admin/reports.tsx
web/pages/admin/test-user.tsx
web/pages/ai/[[...slug]].tsx
web/pages/api/og/market.tsx
web/pages/api/og/update.tsx
web/pages/api/v0/_types.ts
web/pages/api/v0/_validate.ts
web/pages/api/v0/revalidate.ts
web/pages/browse/[[...slug]].tsx
web/pages/calibration.tsx
web/pages/cards/index.tsx
web/pages/charity/[charitySlug].tsx
web/pages/charity/index.tsx
web/pages/cowp.tsx
web/pages/create.tsx
web/pages/dashboard/index.tsx
web/pages/discord-bot.tsx
web/pages/election/[[...slug]].tsx
web/pages/embed/[username]/[contractSlug].tsx
web/pages/embed/analytics.tsx
web/pages/embed/grid/[...slugs]/index.tsx
web/pages/explore.tsx
web/pages/gidx/register.tsx
web/pages/home/index.tsx
web/pages/index.tsx
web/pages/lab.tsx
web/pages/leaderboards.tsx
web/pages/leagues/[[...leagueSlugs]].tsx
web/pages/link/[slug].tsx
web/pages/links.tsx
web/pages/live.tsx
web/pages/login.tsx
web/pages/mana-auction.tsx
web/pages/manachan.tsx
web/pages/me.tsx
web/pages/messages/[channelId].tsx
web/pages/messages/index.tsx
web/pages/my-calibration.tsx
web/pages/newbies.tsx
web/pages/news/[slug].tsx
web/pages/news/create.tsx
web/pages/news/index.tsx
web/pages/notifications.tsx
web/pages/og-test/[contractSlug].tsx
web/pages/old-posts/[slug]/index.tsx
web/pages/partner-explainer.tsx
web/pages/partner-leaderboard.tsx
web/pages/payments.tsx
web/pages/profile.tsx
web/pages/public-messages/[channelId].tsx
web/pages/referrals.tsx
web/pages/register-on-discord.tsx
web/pages/reports.tsx
web/pages/server-sitemap.xml.tsx
web/pages/sign-in-waiting.tsx
web/pages/sitemap.tsx
web/pages/stats.tsx
web/pages/styles.tsx
web/pages/supabase-live.tsx
web/pages/tv/[[...scheduleId]].tsx
web/pages/twitch.tsx
web/pages/websocket-live.tsx
web/pages/week/[username]/[rangeEndDateSlug].tsx
web/pages/yc-s23.tsx
web/public/custom-components/coin.tsx
web/public/custom-components/congress.tsx
web/public/custom-components/congress_center.tsx
web/public/custom-components/congress_house.tsx
web/public/custom-components/congress_senate.tsx
web/public/custom-components/governor.tsx
web/public/custom-components/manaCoin.tsx
web/public/custom-components/spiceCoin.tsx
web/public/custom-components/tiers.tsx
web/public/custom-components/tipJar.tsx
web/public/custom-components/whiteHouse.tsx
web/public/data/elections-data.ts
web/public/data/governors-data.ts
web/public/data/house-data.ts
web/public/data/policy-data.ts
web/public/data/senate-state-data.ts
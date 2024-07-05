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
import { broadcast, broadcastMulti } from './server'
import { Bet, LimitBet } from 'common/bet'
import { Contract, Visibility } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { Answer } from 'common/answer'

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

We recommend running scripts via `ts-node`.

```sh
ts-node manicode.ts "Generate a page called cowp, which has cows that make noises!"
```

Here's our API schema. Each key-value pair in the below object corresponds to an endpoint.

E.g. 'comment' can be accessed at `api.manifold.markets/v0/comment`. If 'visibility' is 'public', then you need the '/v0', otherwise, you should omit the version. However, you probably don't need the url, you can use our library function `api('comment', props)`, or `useAPIGetter('comment', props)`

```ts
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
```

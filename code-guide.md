Hello this is a short guide to coding on Manifold! It was written to provide context to Claude, so he can know how to code for us.

Our code is all Typescript and split into a few packages. At the top level, there are 3 code directories:

- common
- web
- backend

Common has lots of type definitions for our data structures, like Contract and User. It also contains many useful utility functions. We try not to add package dependencies to common.

These three directories should be completely isolated in their imports, i.e. they should not import files from each other, except web and backend are allowed to import from common. Common cannot import from web or backend, and web and backend cannot import from each other.

Web contains our front end code in React and Next.js. We use tailwind for styling.

Web can be broken down into

- pages
- components
- hooks
- lib

Pages define the routes and what is visible on each.
Components have reusable react components organized by which feature uses them (e.g. bet subdirectory contains components for betting), or by their function (e.g. buttons subdirectory contains a variety of buttons).
Hooks contain react hooks used across components. We often define several related hooks in one file. For example, use-bets.ts has `useBetsOnce`, `useContractBets`, `useSubscribeGlobalBets`, and a few others.
Lib has common utility functions specific to the client as well as the service layer to communicate with our api, and authentication.

The backend is further split into:

- shared
- api
- scheduler
- scripts

Shared has common utility and database functions used across the other directories.
Api defines all the endpoints of our server.
Scheduler is an independent sever that runs our chron jobs (tasks that execute on a time interval).
Scripts contains one-off bits of code that we run for a specific purpose.

Each can import from shared and api. Scheduler and scripts should not be referenced, except internally. None of these should import from web.

---

Here's an example component from web in our style:

```ts
import clsx from 'clsx'
import Link from 'next/link'

import { isAdminId, isModId } from 'common/envs/constants'
import { type Headline } from 'common/news'
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

---

We prefer to have many smaller components that each represent one logical unit, rather than one very large component that does everything. Then we compose and reuse the components.

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

---

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

---

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

---

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

---

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

---

We have our scripts in the directory `backend/scripts`.

To write a script, run it inside the helper function called `runScript` that automatically fetches any secret keys and loads them into process.env.

Example from `backend/scripts/manicode.ts`

```ts
import { runScript } from 'run-script'

runScript(async ({ pg }) => {
  const userPrompt = process.argv[2]
  // E.g.:
  // I want to create a new page which shows off what's happening on manifold right now. Can you use our websocket api to get recent bets on markets and illustrate what's happening in a compelling and useful way?
  if (!userPrompt) {
    console.log('Please provide a prompt on what code to change.')
    return
  }

  await manicode(pg, userPrompt)
})
```

We recommend running scripts via `ts-node`. Example:

```sh
ts-node manicode.ts "Generate a page called cowp, which has cows that make noises!"
```

---

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

---

We have two ways to access our postgres database.

```ts
const pg = createSupabaseDirectClient()
```

and

```ts
const db = createSupabaseClient()
```

The first (createSupabaseDirectClient) lets us specify sql strings to run directly on our database, using the pg-promise library. The client (code in web) does not have permission to do this.

Example using the direct client:

```ts
export const getUniqueBettorIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `
      select
          distinct user_id
      from contract_bets
        where contract_id = $1`,
    [contractId]
  )
  return res.map((r) => r.user_id as string)
}
```

We are deprecating the latter approach (createSupabaseClient), so avoid using it entirely for new code. It uses postgREST, a rest api that is turned into sql. The client can also use this to connect directly to our database. The recommended path is to instead create an endpoint on our server, and have that use the supabase direct client to return data to the client.

Example using supabase client:

```ts
export const getContractIdFromSlug = async (
  db: SupabaseClient,
  slug?: string
) => {
  if (!slug) return undefined

  const { data, error } = await db
    .from('contracts')
    .select('id')
    .eq('slug', slug)
    .single()

  if (error) throw new APIError(404, `Contract with slug ${slug} not found`)
  return data.id
}
```

### Misc coding tips

We have many useful hooks that should be reused rather than rewriting them again. For example, to get the live global bets, you should use

```ts
import { useSubscribeGlobalBets } from 'web/hooks/use-bets'

...

const bets = useSubscribeGlobalBets()
```

---

We prefer using lodash functions instead of reimplementing them with for loops:

```ts
import { keyBy, uniq } from 'lodash'

const betsByUserId = keyBy(bets, 'userId')
const betIds = uniq(bets, (b) => b.id)
```

---

Because we target es5, we can't iterate through a Set in a for loop, for example:

```ts
const betIds = []
const betIdSet = new Set(array)
for (const id of betIdSet) { // Is a compilation error, since a Set is not iterable without a polyfill.
  ...
}
```

Instead, you should just avoid using sets here. Consider using lodash's uniq function instead:

```ts
const betIds = uniq([])
for (const id of betIds) {
  ...
}
```

---

If you don't provide the type, it will default to unknown, and cause a type error

```ts
try {
  await getUserDataDump(identifier)
}
} catch (error) {
  console.error('Error:', error.message) // Type error accessing ".message" since error is unknown type.
}
```

You can fix it by either adding a type annotation, or checking if a field is in the object (`'message' in error`) or by using instanceof:

```ts
try {
  await getUserDataDump(identifier)
} catch (error) {
  console.error(
    'Error:',
    error instanceof Error ? error.message : String(error)
  )
}
```

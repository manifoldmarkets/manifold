---
id: api
slug: /api
---

# Manifold API

Programmatic access to [Manifold](https://manifold.markets).

:::caution

Our API was historically hosted on `https://manifold.markets/api`, but we recently moved to give the API its own domain at `api.manifold.markets`.

Please migrate any code you have to the new domain. The old domain will disappear at some point in the future.

:::

:::caution

Our API is still in alpha — things may change or break at any time!

If you have questions, come chat with us on [Discord](https://discord.com/invite/eHQBNBqXuh). We'd love to hear about what you build!

If you notice any errors or omissions in this documentation, please let us know on Discord, or fix it yourself by [submitting a pull request](https://github.com/manifoldmarkets/manifold/blob/main/docs/docs/api.md).

:::

# Get Started

In your terminal:

```bash
curl "https://api.manifold.markets/v0/markets?limit=1" -X GET
```

You can also [go to the url directly](https://api.manifold.markets/v0/markets?limit=1) in your browser to see the response of any GET request.

GET requests with parameters should have the parameters in the query string. POST and PUT requests should have a body with a JSON object with one property per parameter:

```bash
 curl "https://api.manifold.markets/v0/bet" -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"amount":1, \
                 "outcome":"YES", \
                 "contractId":"i95HLfK9N6hu5H7orfNj"}'
```

API responses should always either have a body with a JSON result object (if the response was a 200)
or with a JSON object representing an error (if the response was a 4xx or 5xx).

All times are UNIX timestamps in milliseconds since epoch. (Javascript timestamps.)

As a point of naming, a topic (the tag on a question) is called a "group" in the code and in the api, and a question is called a "contract" in the code and sometimes a "market" in the api.

## Authentication

Some APIs are not associated with any particular user. Other APIs require authentication.

APIs that require authentication accept an `Authorization` header in one of two formats:

- `Authorization: Key {key}`. A Manifold API key associated with a user
  account. Each account may have zero or one API keys. To generate an API key
  for your account, visit your user profile, click "edit", and click the
  "refresh" button next to the API key field at the bottom. You can click it
  again any time to invalidate your existing key and generate a new one.

- `Authorization: Bearer {jwt}`. A signed JWT from Firebase asserting your
  identity. This is what our web client uses. It will probably be annoying for
  you to generate and we will not document it further here.

## Usage Guidelines

Feel free to use the API for any purpose you'd like. There is a rate limit of 500 requests per minute per IP. Please don't use multiple IP addresses to circumvent this limit.

## Fees

- Comments placed through the API will incur a $M1 transaction fee.

## Trade history dumps

For data analysis and backtesting purposes, you can bulk download all markets and bets/trades on the platform since December 2021.

- [Bets data 2024-07-04](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-bets-04072024.json.zip?alt=media&token=5ff8fd10-8079-4570-9728-7d0be1d4a463) (967MB)
- [Markets data 2024-07-06](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-contracts-20240706.json.zip?alt=media&token=ca3ef6b6-fe61-41b4-a789-dcc2d4ea4421) (87MB)
- [Comments data 2024-07-06](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-comments-20240706.json.zip?alt=media&token=08f9a2b1-534a-493d-bb01-77cf1f54b9f3) (127MB)

Data dumps last updated: July 6, 2024

## Useful resources

We're open source!

[common/src/api/schema.ts](https://github.com/manifoldmarkets/manifold/tree/main/common/src/api/schema.ts) - type definitions of the apis, including parameters and return values.

## Endpoints

### `GET /v0/user/[username]`

Get a user by their username. Remember that usernames may change.

Requires no auth.

Response type: `User`

```tsx
type User = {
  id: string // user's unique id
  createdTime: number

  name: string // display name, may contain spaces
  username: string // username, used in urls
  url: string // link to user's profile
  avatarUrl?: string

  bio?: string
  bannerUrl?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  isBot?: boolean
  isAdmin?: boolean // is Manifold team
  isTrustworthy?: boolean // is Moderator
  isBannedFromPosting?: boolean
  userDeleted?: boolean

  // Note: the following are here for convenience only and may be removed in the future.
  balance: number
  totalDeposits: number
  lastBetTime?: number
  currentBettingStreak?: number
}
```

### `GET /v0/user/[username]/lite`

Get basic user display info by username

Requires no auth.

Response type: `DisplayUser`

```tsx
type DisplayUser = {
  id: string
  name: string // display name, may include spaces
  username: string // username, used in urls
  avatarUrl?: string
}
```

### `GET /v0/user/by-id/[id]`

Get a user by their unique ID. Many other API endpoints return this as the `userId`.

Requires no auth.

Response type: `User`

### `GET /v0/user/by-id/[id]/lite`

Get a user's display info by unique ID

Requires no auth

Response type: `DisplayUser`

### `GET /v0/me`

Return the [authenticated](#authentication) user.

Response type: `User`

### `GET /v0/user/[username]/bets` (Deprecated)

Get bets by a particular user.

Requires no auth.

_This api is deprecated in favor of the more versatile [/v0/bets/](#get-v0bets) api._

### `GET /v0/groups`

Get all topics, in order of descending creation time, 500 at a time. This endpoint returns only public topics, not curated or private ones.

Parameters:

- `beforeTime`: Optional. Get only topics created before this time.
- `availableToUserId`: Optional. Get only topics that the user has access to.

Requires no auth.

Response type: Array of `Group`

### `GET /v0/group/[slug]`

Get a topic by its slug.

Requires no auth.

### `GET /v0/group/by-id/[id]`

Get a topic by its unique ID.

Requires no auth.

### `GET /v0/group/by-id/[id]/markets` (Deprecated)

Get markets tagged with this topic.

Requires no auth.

_This api is deprecated in favor of the more versatile [/v0/markets](#get-v0markets) api below._

### `GET /v0/markets`

List all markets, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many markets to return. The maximum is 1000 and the default is 500.
- `sort`: Optional. One of 'created-time', 'updated-time', 'last-bet-time', or 'last-comment-time'
  to sort by that timestamp. Defaults to 'created-time'.
- `order`: Optional. One of 'asc' or 'desc'. Defaults to 'desc'.
- `before`: Optional. The ID of the market before which the list will start. For
  example, if you ask for the most recent 10 markets, and then perform a second
  query for 10 more markets with `before=[the id of the 10th market]`, you will
  get markets 11 through 20.
- `userId`: Optional. Include only markets created by this user.
- `groupId`: Optional. Include only markets tagged with this topic.

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/markets?limit=1" -X GET
```

Example response:

```json
[
  {
    "id":"EvIhzcJXwhL0HavaszD7",
    "creatorUsername":"Austin",
    "creatorName":"Austin",
    "createdTime":1653850472294,
    "creatorAvatarUrl":"https://lh3.googleusercontent.com/a-/AOh14GiZyl1lBehuBMGyJYJhZd-N-mstaUtgE4xdI22lLw=s96-c",
    "closeTime":1653893940000,
    "question":"Will I write a new blog post today?",
    "url":"https://manifold.markets/Austin/will-i-write-a-new-blog-post-today",
    "pool":146.73022894879944,
    "probability":0.8958175225896258,
    "p":0.08281474972181882,//This is the probability around which the market liquidity is "centered'.
    "totalLiquidity":102.65696071594805,
    "outcomeType":"BINARY",
    "mechanism":"cpmm-1",
    "volume":241,
    "volume24Hours":0,
    "isResolved":true,
    "resolution":"YES",
    "resolutionTime":1653924077078
  },
  ...
```

Response type: Array of `LiteMarket`

```tsx
// Information about a market, but without bets or comments
type LiteMarket = {
  // Unique identifer for this market
  id: string

  // Attributes about the creator
  creatorId: string
  creatorUsername: string
  creatorName: string
  creatorAvatarUrl?: string

  // Market atributes
  createdTime: number // When the market was created
  closeTime?: number // Min of creator's chosen date, and resolutionTime
  question: string

  // Note: This url always points to https://manifold.markets, regardless of what instance the api is running on.
  // This url includes the creator's username, but this doesn't need to be correct when constructing valid URLs.
  //   i.e. https://manifold.markets/Austin/test-market is the same as https://manifold.markets/foo/test-market
  url: string

  outcomeType: string // BINARY, FREE_RESPONSE, MULTIPLE_CHOICE, NUMERIC, PSEUDO_NUMERIC, BOUNTIED_QUESTION, POLL, or ...
  mechanism: string // dpm-2, cpmm-1, or cpmm-multi-1

  probability: number
  pool: { outcome: number } // For CPMM markets, the number of shares in the liquidity pool. For DPM markets, the amount of mana invested in each answer.
  p?: number // CPMM markets only, probability constant in y^p * n^(1-p) = k
  totalLiquidity?: number // CPMM markets only, the amount of mana deposited into the liquidity pool

  value?: number // PSEUDO_NUMERIC markets only, the current market value, which is mapped from probability using min, max, and isLogScale.
  min?: number // PSEUDO_NUMERIC markets only, the minimum resolvable value
  max?: number // PSEUDO_NUMERIC markets only, the maximum resolvable value
  isLogScale?: bool // PSEUDO_NUMERIC markets only, if true `number = (max - min + 1)^probability + minstart - 1`, otherwise `number = min + (max - min) * probability`

  volume: number
  volume24Hours: number

  isResolved: boolean
  resolutionTime?: number
  resolution?: string
  resolutionProbability?: number // Used for BINARY markets resolved to MKT
  uniqueBettorCount: number

  lastUpdatedTime?: number
  lastBetTime?: number

  token?: 'MANA' | 'CASH' // mana or prizecash question
  siblingContractId?: string // id of the prizecash or mana version of this question that you get to by toggling.
}
```

### `GET /v0/market/[marketId]`

Get information about a single market by ID. Includes answers, but not bets and
comments. Use `/bets` or `/comments` with a market ID to retrieve bets or
comments.

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/market/3zspH9sSzMlbFQLn9GKR" -X GET
```

Example response:

```json
{
  "id": "lEoqtnDgJzft6apSKzYK",
  "creatorUsername": "Angela",
  "creatorName": "Angela",
  "createdTime": 1655258914863,
  "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
  "closeTime": 1655265001448,
  "question": "What is good?",
  "description": "Resolves proportionally to the answer(s) which I find most compelling. (Obviously I'll refrain from giving my own answers)\n\n(Please have at it with philosophy, ethics, etc etc)\n\n\nContract resolved automatically.",
  "url": "https://manifold.markets/Angela/what-is-good",
  "pool": null,
  "outcomeType": "FREE_RESPONSE",
  "mechanism": "dpm-2",
  "volume": 112,
  "volume24Hours": 0,
  "isResolved": true,
  "resolution": "MKT",
  "resolutionTime": 1655265001448,
  "token": "MANA",
  "answers": [
    {
      "createdTime": 1655258941573,
      "avatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
      "id": "1",
      "username": "Angela",
      "number": 1,
      "name": "Angela",
      "contractId": "lEoqtnDgJzft6apSKzYK",
      "text": "ANTE",
      "userId": "qe2QqIlOkeWsbljfeF3MsxpSJ9i2",
      "probability": 0.66749733001068
    },
    {
      "name": "Isaac King",
      "username": "IsaacKing",
      "text": "This answer",
      "userId": "y1hb6k7txdZPV5mgyxPFApZ7nQl2",
      "id": "2",
      "number": 2,
      "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GhNVriOvxK2VUAmE-jvYZwC-XIymatzVirT0Bqb2g=s96-c",
      "contractId": "lEoqtnDgJzft6apSKzYK",
      "createdTime": 1655261198074,
      "probability": 0.008922214311142757
    },
    {
      "createdTime": 1655263226587,
      "userId": "jbgplxty4kUKIa1MmgZk22byJq03",
      "id": "3",
      "avatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FMartin%2Fgiphy.gif?alt=media&token=422ef610-553f-47e3-bf6f-c0c5cc16c70a",
      "text": "Toyota Camry",
      "contractId": "lEoqtnDgJzft6apSKzYK",
      "name": "Undox",
      "username": "Undox",
      "number": 3,
      "probability": 0.008966714133143469
    },
    {
      "number": 4,
      "name": "James Grugett",
      "userId": "5LZ4LgYuySdL1huCWe7bti02ghx2",
      "text": "Utility (Defined by your personal utility function.)",
      "createdTime": 1655264793224,
      "contractId": "lEoqtnDgJzft6apSKzYK",
      "username": "JamesGrugett",
      "id": "4",
      "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GjC83uMe-fEfzd6QvxiK6ZqZdlMytuHxevgMYIkpAI=s96-c",
      "probability": 0.09211463154147384
    }
  ]
}
```

Response type: A `FullMarket`

```tsx
// A complete market, along with answers (for free response markets)
type FullMarket = LiteMarket & {
  answers?: Answer[] // multi markets only
  shouldAnswersSumToOne?: boolean // multi markets only, whether answers are dependant (that is add up to 100%, typically used when only one answer should win). Always true for dpm-2 multiple choice and free response
  addAnswersMode?: 'ANYONE' | 'ONLY_CREATOR' | 'DISABLED' // multi markets only, who can add answers

  options?: { text: string; votes: number }[] // poll only

  totalBounty?: number // bounty only
  bountyLeft?: number // bounty only

  description: JSONContent // Rich text content. See https://tiptap.dev/guide/output#option-1-json
  textDescription: string // string description without formatting, images, or embeds
  coverImageUrl?: string
  groupSlugs?: string[] // topics tagged in this market
}
```

### `GET /v0/market/[marketId]/prob`

Get the current probability (or probabilities for multiple choice markets) for a market without caching.

Parameters:

- `id`: Required. The ID of the market.

Example request:

```bash
curl "https://api.manifold.markets/v0/market/9t61v9e7x4/prob" -X GET
```

Example response:

```json
{
  "prob": 0.62
}
```

For non-binary markets (e.g. multiple choice, set) you get a dictionary of probabilities for each answer id.

Example response:

```json
{
  "answerProbs": {
    "PI806hsqn2": 0.670156962142921,
    "tO5sp2SAlA": 0.3298430378570791
  }
}
```

### `GET /v0/market-probs`

Get the current probabilities for multiple markets in a single request.

Parameters:

- `ids`: Required. An array of market IDs, up to length 100.

Example request:

```bash
curl "https://api.manifold.markets/v0/market-probs?ids=9t61v9e7x4&ids=ZNlNdzz690" -X GET
```

Example response:

```json
{
  "9t61v9e7x4": {
    "prob": 0.62
  },
  "ZNlNdzz690": {
    "answerProbs": {
      "answer1": 0.67,
      "answer2": 0.33
    }
  }
}
```

### `GET /v0/market/[marketId]/positions`

Get positions information about a single market.

Parameters:

- `order`: Optional. `shares` or `profit` (default). The field to order results by.
- `top`: Optional. The number of top positions (ordered by `order`) to return.
- `bottom`: Optional. The number of bottom positions (ordered by `order`) to return.
- `userId`: Optional. The user ID to query by. If provided, only the position for this user will be returned.
- `answerId`: Optional. The answer ID to query by. If provided, only the positions for this answer will be returned.

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/market/kupKInoLsjMuiDiNfogm/positions?top=1&bottom=1" -X GET
```

Example response:

```json
[
  {
    "from": {
      "day": {
        "value": 23.479030029570662,
        "profit": 0,
        "invested": 23.479030029570662,
        "prevValue": 23.479030029570662,
        "profitPercent": 0
      },
      "week": {
        "value": 0,
        "profit": 8.479030029570673,
        "invested": 15,
        "prevValue": 0,
        "profitPercent": 56.52686686380448
      },
      "month": {
        "value": 0,
        "profit": 8.479030029570673,
        "invested": 15,
        "prevValue": 0,
        "profitPercent": 56.52686686380448
      }
    },
    "loan": 1.7123642870400002,
    "payout": 23.479030029570673,
    "profit": 8.479030029570673,
    "userId": "IpTiwOTs96VIzeoxu66tfitUcBZ2",
    "invested": 15,
    "userName": "Lucas Goldfein",
    "hasShares": true,
    "contractId": "kupKInoLsjMuiDiNfogm",
    "hasNoShares": true,
    "lastBetTime": 1678924706057,
    "totalShares": {
      "NO": 89.17418492518308
    },
    "hasYesShares": false,
    "userUsername": "LucasGoldfein56b1",
    "profitPercent": 56.52686686380448,
    "userAvatarUrl": "https://lh3.googleusercontent.com/a/AEdFTp5e7cFzq1moc91CKqaAgyEleoNTjtEL9ke8emzV=s96-c",
    "maxSharesOutcome": "NO"
  },
  {
    "from": {
      "day": {
        "value": 5.008090894597479,
        "profit": 0,
        "invested": 5.008090894597479,
        "prevValue": 5.008090894597479,
        "profitPercent": 0
      },
      "week": {
        "value": 0,
        "profit": -4.991909105402519,
        "invested": 10,
        "prevValue": 0,
        "profitPercent": -49.919091054025195
      },
      "month": {
        "value": 0,
        "profit": -4.991909105402519,
        "invested": 10,
        "prevValue": 0,
        "profitPercent": -49.919091054025195
      }
    },
    "loan": 1.14157619136,
    "payout": 5.008090894597481,
    "profit": -4.991909105402519,
    "userId": "JNkmw38JICdw6ySJ9RgWK7WyBdE2",
    "invested": 10,
    "userName": "Sylvie",
    "hasShares": true,
    "contractId": "kupKInoLsjMuiDiNfogm",
    "hasNoShares": true,
    "lastBetTime": 1678914591730,
    "totalShares": {
      "NO": 19.020906016751987
    },
    "hasYesShares": false,
    "userUsername": "sylv",
    "profitPercent": -49.919091054025195,
    "userAvatarUrl": "https://lh3.googleusercontent.com/a/AATXAJyoOZtkrJBItDvRE0HvcRDn8txM-_v033jFIifZ=s96-c",
    "maxSharesOutcome": "NO"
  }
]
```

Response type: An array of `ContractMetric`

```tsx
// A single position in a market
type ContractMetric = {
  contractId: string
  from:
    | {
        // includes, day, week,month
        [period: string]: {
          profit: number
          profitPercent: number
          invested: number
          prevValue: number
          value: number
        }
      }
    | undefined
  hasNoShares: boolean
  hasShares: boolean
  hasYesShares: boolean
  invested: number
  loan: number
  maxSharesOutcome: string | null
  payout: number
  profit: number
  profitPercent: number
  totalShares: {
    [outcome: string]: number
  }
  userId: string
  userUsername: string
  userName: string
  userAvatarUrl: string
  lastBetTime: number
}
```

### `GET /v0/slug/[marketSlug]`

Get information about a single market by slug (the portion of the URL path after the username).

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/slug/will-carrick-flynn-win-the-general" -X GET
```

Response type: A `FullMarket`

### `GET /v0/search-markets`

Search or filter markets, Similar to the [browse page](https://manifold.markets/browse).

Requires no auth.

Parameters:

- `term`: The search query in question. Can be empty string.
- `sort`: Optional. One of `most-popular` (default), `newest`, `score`, `daily-score`, `freshness-score`, `24-hour-vol`, `liquidity`, `subsidy`, `last-updated`, `close-date`, `start-time`, `resolve-date`, `random`, `bounty-amount`, `prob-descending`, or `prob-ascending`.
- `filter`: Optional. Closing state. One of `all` (default), `open`, `closed`, `resolved`, `news`, `closing-90-days`, `closing-week`, `closing-month`, or `closing-day`.
- `contractType`: Optional. `ALL` (default), `BINARY` (yes/no), `MULTIPLE_CHOICE`, `BOUNTY`, `POLL`, or ... (see code)
- `topicSlug`: Optional. Only include questions with the topic tag with this slug.
- `creatorId`: Optional. Only include questions created by the user with this id.
- `limit`: Optional. Number of contracts to return from 0 to 1000. Default 100.
- `offset`: Optional. Number of contracts to skip. Use with limit to paginate the results.
- `liquidity`: Optional. Minimum liquidity per contract (or per answer according to tier map)
- `creatorId`: Optional. Only markets from creator id.

Requires no auth.

Example request:

```bash
curl https://api.manifold.markets/v0/search-markets?term=biden&sort=liquidity&filter=resolved&contractType=BINARY&limit=2 -X GET
```

Response type: Array of `LiteMarket`.

### `GET /v0/users`

List all users, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many users to return. The maximum is 1000 and the default is 500.
- `before`: Optional. The ID of the user before which the list will start. For
  example, if you ask for the most recent 10 users, and then perform a second
  query for 10 more users with `before=[the id of the 10th user]`, you will
  get users 11 through 20.

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/users?limit=1" -X GET
```

Example response:

```json
[
  {
    "id": "igi2zGXsfxYPgB0DJTXVJVmwCOr2",
    "createdTime": 1639011767273,
    "name": "Austin",
    "username": "Austin",
    "url": "https://manifold.markets/Austin",
    "avatarUrl": "https://lh3.googleusercontent.com/a-/AOh14GiZyl1lBehuBMGyJYJhZd-N-mstaUtgE4xdI22lLw=s96-c",
    "bio": "I build Manifold! Always happy to chat; reach out on Discord or find a time on https://calendly.com/austinchen/manifold!",
    "bannerUrl": "https://images.unsplash.com/photo-1501523460185-2aa5d2a0f981?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1531&q=80",
    "website": "https://blog.austn.io",
    "twitterHandle": "akrolsmir",
    "discordHandle": "akrolsmir#4125",
    "balance": 9122.607163564959,
    "totalDeposits": 10339.004780544328,
    "totalPnLCached": 9376.601262721899
  }
]
```

Response type: Array of `User`

### `POST /v0/bet`

Place a new bet or limit order.

Parameters:

- `amount`: The amount to bet, in mana, before fees.
- `contractId`: The ID of the market to bet on.
- `outcome`: Optional. `YES` (default) or `NO`
- `limitProb`: Optional. Makes this a limit order. `limitProb` is a number from `0.01` to `0.99` representing the probability price to set a limit order at (like 0.01 is 1%). Can only be two decimal digits - a whole precent.

  If the limit crosses the market price, the bet will execute immediately in the direction of `outcome` up to the limit. If not all the bet is filled, the rest will remain as an open limit order.

  - For example, if the current market probability is `50%`:
    - A `M$10` bet on `YES` with `limitProb=0.4` would not be filled until the market probability moves down to `40%` and someone bets `M$15` of `NO` to match your
      bet odds.
    - A `M$100` bet on `YES` with `limitProb=0.6` would fill partially or completely depending on current unfilled limit bets and the AMM's liquidity. Any remaining portion of the bet not filled would remain to be matched against in the future.
  - An unfilled limit order bet can be cancelled using the cancel API.

- `expiresAt`: Optional. When the limit order should be automatically canceled.
- `expiresMillisAfter`: Optional. Miliseconds after creation when the limit order should be automatically canceled.
- `dryRun`: Optional. If true, the bet will not be placed and the API will return a simulated result.

[Requires Auth](#authentication).

Response type: A `Bet`.

### `POST /v0/bet/cancel/[id]`

Cancel a limit order.

### `POST /v0/market`

Create a new market.

This costs mana:

| Market Type     | Creation Cost                             |
| --------------- | ----------------------------------------- |
| BINARY          | M$50                                      |
| PSEUDO_NUMERIC  | M$250                                     |
| MULTIPLE_CHOICE | M$25/answer or M$25 for no preset answers |

Parameters:

- `outcomeType`: `BINARY`, `MULTIPLE_CHOICE`, `PSEUDO_NUMERIC`, `POLL`, or `BOUNTIED_QUESTION`.
- `question`: The headline question for the market.
- `description`: Optional. A description for the market. Note: for formatted text instead use:

  - `descriptionHtml`: string with html
  - `descriptionMarkdown`: string with markdown
  - `descriptionJson`: stringified [TipTap json](https://tiptap.dev/guide/output#option-1-json)

- `closeTime`: Optional. When the market will close. Defaults to 7 days from now.
- `visibility`: Optional. `public` (default) or `unlisted`. Controls whether the market can be shown on homepage and in search results.
- `groupIds`: Optional. An array of topics to tag this market with.
- `extraLiquidity`: Optional.

For binary markets, you must also provide:

- `initialProb`: An initial probability for the market, between 1 and 99.

For numeric markets, you must also provide:

- `min`: The minimum value that the market may resolve to.
- `max`: The maximum value that the market may resolve to.
- `isLogScale`: If true, your numeric market will increase exponentially from min to max.
- `initialValue`: An initial value for the market, between min and max, exclusive.

For multiple choice markets, you must also provide:

- `answers`: An array of strings, each of which will be a valid answer for the market.
- `addAnswersMode`: Optional. Controls who can add answers to the market after it has been created. Must be one of `'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'`. Defaults to `'DISABLED'`.
- `shouldAnswersSumToOne`: Optional. If `true`, makes this market auto-arbitrage so that probabilities add up to 100% and restricts market resolution accordingly.

For bountied questions, you must also provide:

- `totalBounty`: The total amount of mana to be distributed to the best answers.

For polls, you must also provide:

- `answers`: An array of strings, each of which will be an option for the poll.

[Requires Auth](#authentication).

Response type: `LiteMarket`

### `POST /v0/market/[marketId]/answer`

Add a valid answer for the market. Currently only supports `MULTIPLE_CHOICE` markets.

Parameter:

- `text`: The answer text.

[Requires Auth](#authentication).

### `POST /v0/market/[marketId]/add-liquidity`

Add mana to liquidity pool. Does not boost.

Parameter:

- `amount`: Amount of M$ to add

[Requires Auth](#authentication).

### `POST /v0/market/[marketId]/add-bounty`

Add mana to a bounty question's reward.

Parameters:

- `amount`: Amount of M$ to add

[Requires Auth](#authentication).

Response type: `Txn`

### `POST /v0/market/[marketId]/award-bounty`

Distribute a bounty market reward.

Parameters:

- `amount`: Amount of M$ to add
- `commentId`: The comment to award the bounty to.

[Requires Auth](#authentication).

Response type: `Txn`

### `POST /v0/market/[marketId]/close`

Set the close time of a market.

Parameter:

- `closeTime`: Optional. Milliseconds since the epoch to close the market at. If not provided, close the market immediately.

[Requires Auth](#authentication).

### `POST /v0/market/[marketId]/group`

Add or remove a topic tag from a market.

Parameters:

- `groupId`: The ID of the topic.
- `remove`: Optional. Set to `true` to un-tag the topic.

[Requires Auth](#authentication). Must be admin/moderator/creator of topic if curated/private. Must be market creator or site moderator if topic is public.

### `POST /v0/market/[marketId]/resolve`

Resolve a market. The required payload format depends on the market type.

#### For Binary Markets

- **outcome**: One of `YES`, `NO`, `MKT`, or `CANCEL`.
- **probabilityInt** (optional): The probability to use for a `MKT` resolution.

#### For Free Response or Multiple Choice Markets

The resolution payload format depends on the market’s `shouldAnswersSumToOne` setting:

**1. When `shouldAnswersSumToOne` is true (the default for dpm-2 free response and multiple choice):**

Use the weighted resolution format:

```json
{
  "outcome": "MKT",  // or CANCEL, or a number indicating the selected answer index
  "resolutions": [
    { "answer": <number>, "pct": <number> }
  ]
}
```

- Each object in the `resolutions` array assigns a weight (`pct`) to an answer (indicated by its index). The weights must add up to 100.

**2. When `shouldAnswersSumToOne` is false:**

Resolve each answer individually, as you would for a binary market. For each answer, issue a separate resolve request with a payload that includes:

- **outcome**: Either `"YES"` (if the answer is resolved as a win) or `"NO"` (if resolved as a loss).
- **answerId**: The unique identifier for the answer (as returned in the full market’s `answers` array).

For example, to resolve an individual answer:

```json
{
  "outcome": "YES", // or "NO"
  "answerId": "<answerId>"
}
```

This approach treats each answer as an independent binary resolution, ensuring that the actual answer identifier is included in the payload.

#### For Numeric Markets

- **outcome**: Either `CANCEL` or a number indicating the selected numeric bucket ID.
- **value**: The value that the market resolves to.
- **probabilityInt**: Required if `value` is provided. It should equal:
  - For log scale: `log10(value - min + 1) / log10(max - min + 1)`
  - Otherwise: `(value - min) / (max - min)`

[Requires Auth](#authentication).

### `POST /v0/market/[marketId]/sell`

Sell shares in a market.

Parameters:

- `outcome`: `YES` or `NO`. Which kind of shares you are selling - defaults to the kind you have.
- `shares`: Optional. How many shares you are selling - defaults to all.
- `answerId`: Required on multi choice. The ID of the answer you are selling your position in.

[Requires Auth](#authentication).

### `POST /v0/comment`

Create a comment in the specified market. Only supports top-level comments for now.

Parameters:

- `contractId`: The ID of the market to comment on.
- `content`: The comment to post, formatted as [TipTap json](https://tiptap.dev/guide/output#option-1-json), OR
- `html`: The comment to post, formatted as an HTML string, OR
- `markdown`: The comment to post, formatted as a markdown string.

[Requires Auth](#authentication).

<!-- ### `POST /v0/hide-comment`

Hides a comment for all users.

Parameter:

- `commentPath`: ...

[Requires Auth](#authentication) Must be a moderator. -->

### `GET /v0/comments`

Get a list of comments for a contract or user, ordered by creation date descending.

Parameters:

- `contractId`: Optional. The ID of the market to read comments of.
- `contractSlug`: Optional. The slug of the market to read comments of.
- `limit`. Optional. How many comments to return. The default and maximum are both 1000.
- `page`. Optional. For pagination with `limit`
- `userId`: Optional. Get only comments created by this user.

Requires no auth.

### `GET /v0/bets`

Gets a list of bets, ordered by creation date descending.

Parameters:

- `userId`: Optional. Include only bets by the user with this ID.
- `username`: Optional. Include only bets by the user with this username.
- `contractId`: Optional. Include only bets on the market with this ID. Can be multiple ids.
- `contractSlug`: Optional. Include only bets on the market with this slug.
- `limit`: Optional. How many bets to return. The default and maximum are both 1000.
- `before`: Optional. Include only bets created before the bet with this ID.
  - For
    example, if you ask for the most recent 10 bets, and then perform a second
    query for 10 more bets with `before=[the id of the 10th bet]`, you will
    get bets 11 through 20.
- `after`: Optional. Include only bets created after the bet with this ID.
  - For example, if you request the 10 most recent bets and then perform a second query with `after=[the id of the 1st bet]`, you will receive up to 10 new bets, if available.
- `beforeTime`: Optional. Include only bets created before this timestamp.
- `afterTime`: Optional. Include only bets created after this timestamp.
- `kinds`: Optional. Specifies subsets of bets to return. Possible kinds: `open-limit` (open limit orders, including ones on closed and reolved markets).
- `order`: Optional. `asc` or `desc` (default). The sorting order for returned bets.

Example request:

```bash
curl "https://api.manifold.markets/v0/bets?username=Manifold&contractSlug=will-i-be-able-to-place-a-limit-ord" -X GET
```

Response type: An array of `Bet`.

Example response:

```json
[
  // Limit bet, partially filled.
  {
    "isFilled": false,
    "amount": 15.596681605353808, //The amount that has already been filled.
    "userId": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
    "contractId": "Tz5dA01GkK5QKiQfZeDL",
    "probBefore": 0.5730753474948571,
    "isCancelled": false,
    "outcome": "YES",
    "fees": { "creatorFee": 0, "liquidityFee": 0, "platformFee": 0 },
    "shares": 31.193363210707616,
    "limitProb": 0.5,
    "id": "yXB8lVbs86TKkhWA1FVi",
    "loanAmount": 0,
    "orderAmount": 100, //The original amount placed on the limit order when it was created. The amount remaining can be calulated as orderAmount - amount.
    "probAfter": 0.5730753474948571,
    "createdTime": 1659482775970,
    "fills": [
      {
        "timestamp": 1659483249648,
        "matchedBetId": "MfrMd5HTiGASDXzqibr7",
        "amount": 15.596681605353808,
        "shares": 31.193363210707616
      }
    ]
  },
  // Normal bet (no limitProb specified).
  {
    "shares": 17.350459904608414,
    "probBefore": 0.5304358279113885,
    "isFilled": true,
    "probAfter": 0.5730753474948571,
    "userId": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
    "amount": 10,
    "contractId": "Tz5dA01GkK5QKiQfZeDL",
    "id": "1LPJHNz5oAX4K6YtJlP1",
    "fees": {
      "platformFee": 0,
      "liquidityFee": 0,
      "creatorFee": 0.4251333951457593
    },
    "isCancelled": false,
    "loanAmount": 0,
    "orderAmount": 10,
    "fills": [
      {
        "amount": 10,
        "matchedBetId": null,
        "shares": 17.350459904608414,
        "timestamp": 1659482757271
      }
    ],
    "createdTime": 1659482757271,
    "outcome": "YES"
  }
]
```

### `GET /v0/managrams` (Deprecated)

Gets a list of managrams, ordered by creation time descending.

Parameters:

- `toId`: Optional. Returns managrams sent to this user.
- `fromId`: Optional. Returns managrams sent from this user.
- `limit`: Optional. How many managrams to return. The maximum and the default are 100.
- `before`: Optional. The `createdTime` before which you want managrams
- `after`: Optional. The `createdTime` after which you want managrams

Requires no auth.

_This api is deprecated in favor of the more versatile [/v0/txns/](#get-v0txns) api below._

### `POST /v0/managram`

Send mana to another user.

Parameters:

- `toIds`: An array of user IDs to send to.
- `amount`: The amount of mana (must be >= 10) to send to each user.
- `message`: Optional. A message to include.

### `GET /v0/leagues`

Get a list of league standings for a particular user or season.

Parameters:

- `userId`: Optional. Returns only leagues for this user.
- `season`: Optional. Number. Returns only a particular season.
- `cohort`: Optional. String. The snake-cased quirky name of a league - returns only this particular league

Requires no auth.

## Manifold Love Endpoints

### `GET /v0/get-lovers`

See all users' profile data. (Doesn't include answers to compatibility questions.)

Requires no auth.

Example response (truncated):

```json
{
  "lovers": [
    {
      "id": 2,
      "user_id": "5LZ4LgYuySdL1huCWe7bti02ghx2",
      "created_time": "2023-10-21T21:18:26.691Z",
      "last_online_time": "2024-02-02T00:16:34.937Z",
      "city": "San Francisco",
      "gender": "male",
      "pref_gender": [
        "female"
      ],
      "user": {
        "id": "5LZ4LgYuySdL1huCWe7bti02ghx2",
        "bio": "Manifold cofounder! We got the AMM (What!?). We got the order book (What!?). We got the combination AMM and order book!",
      "name": "James",
    },
  ]
}
```

### `GET /v0/get-lover-answers?userId=[user_id]`

See a specific user's answers to compatibility questions.

Requires no auth.

### `GET /v0/txns`

Get a list of transactions, ordered by creation date descending.

Parameters:

- `token`: Optional. Type of token (e.g., 'CASH', 'MANA')
- `offset`: Optional. Number of records to skip (for pagination). Default is 0.
- `limit`: Optional. Maximum number of records to return. The default and maximum are both 100.
- `before`: Optional. Include only transactions created before this timestamp.
- `after`: Optional. Include only transactions created after this timestamp.
- `toId`: Optional. Include only transactions to the user with this ID.
- `fromId`: Optional. Include only transactions from the user with this ID.
- `category`: Optional. Include only transactions of this category.

Requires no auth.

Example request:

```bash
curl "https://api.manifold.markets/v0/txns?limit=10&category=MANA_PAYMENT" -X GET
```

Response type: An array of `Txn`.

Example response:

```json
[
  {
    "id": "INKcoBUVT914i1XUJ6rG",
    "data": {
      "groupId": "e097e0c5-3ce0-4eb2-9ca7-6554f86b84cd",
      "message": "Puzzles for Progress",
      "visibility": "public"
    },
    "toId": "AJwLWoo3xue32XIiAVrL5SyR1WB2",
    "token": "M$",
    "amount": 2500,
    "fromId": "jO7sUhIDTQbAJ3w86akzncTlpRG2",
    "toType": "USER",
    "category": "MANA_PAYMENT",
    "fromType": "USER",
    "createdTime": 1695665438987,
    "description": "Mana payment 2500 from MichaelWheatley to jO7sUhIDTQbAJ3w86akzncTlpRG2"
  },
  ...
]
```

Note: This API corresponds to the `txns` postgres table and does not include bets and liquidity injections.

Example response (truncated):

```json
{
  "answers": [
    {
      "id": 3167,
      "question_id": 187,
      "creator_id": "5LZ4LgYuySdL1huCWe7bti02ghx2",
      "created_time": "2023-12-07T18:44:42.549Z",
      "explanation": "This is a fun question. As a startup founder, I'm a Gryffindor. As a friend, a Hufflepuff. When discussing ideas, I'm a Ravenclaw. When I have a galaxy-brain scheme to alter society and maximize utility, I'm a Slytherin.",
      "multiple_choice": 0,
      "pref_choices": [0, 1, 2, 3],
      "importance": 1
    }
  ]
}
```

### `GET /v0/get-compatibility-questions`

See the text of all compatibility questions.

Requires no auth.

Example response (truncated):

```json
{
  "questions": [
  {
    "id": 297,
    "creator_id": "IwoMKy7dXwXlqeTDn8vPbSe4w4m1",
    "created_time": "2024-01-30T03:04:30.899Z",
    "question": "When we disagree, I prefer to:",
    "importance_score": 0,
    "answer_type": "compatibility_multiple_choice",
    "multiple_choice_options": {
      "Avoid bringing up difficult topics": 3,
      "Discuss the issue calmly and find a compromise": 0,
      "Take some time to cool off before discussing it": 1,
      "Express my feelings directly, even if it gets heated": 2
    },
    "answer_count": 41,
    "score": 12.6829268292683
  },
}
```

## Websockets

Manifold provides a real-time websocket server that allows you to subscribe to updates about markets, bets, and other events. The websocket endpoint is available at `wss://api.manifold.markets/ws` and `wss://api.dev.manifold.markets/ws`.

### Message Format

All messages sent to and from the server must be valid JSON strings. Each client message must include:

- `type`: The type of message ('identify', 'subscribe', 'unsubscribe', or 'ping')
- `txid`: A unique number identifying this message

The server will respond to each client message with an acknowledgement:

```json
{
  "type": "ack",
  "txid": 123,
  "success": true
}
```

### Subscribing to Topics

To subscribe to updates, send a message with:

```json
{
  "type": "subscribe",
  "txid": 123,
  "topics": ["global/new-bet", "contract/[marketId]"]
}
```

Available topics:

#### Global topics

- `global/new-bet` - All new bets across all markets
- `global/new-contract` - All new markets being created
- `global/new-comment` - All new comments across all markets
- `global/new-subsidy` - All new liquidity subsidies
- `global/updated-contract` - Updates to any public market

#### Per-contract topics (replace [marketId] with the actual market ID)

- `contract/[marketId]` - General market updates
- `contract/[marketId]/new-bet` - New bets on this market
- `contract/[marketId]/new-comment` - New comments on this market
- `contract/[marketId]/new-subsidy` - New liquidity subsidies on this market
- `contract/[marketId]/new-answer` - New answers added to this market (for multiple choice markets)
- `contract/[marketId]/updated-answers` - Updates to answers on this market
- `contract/[marketId]/orders` - Updates to limit orders on this market
- `contract/[marketId]/chart-annotation` - New chart annotations on this market
- `contract/[marketId]/user-metrics/[userId]` - Updates to a user's position in this market

#### Other topics

- `user/[userId]` - Updates to a user's public information
- `answer/[answerId]/update` - Updates to a specific answer
- `tv_schedule` - Updates to the TV schedule

### Example Usage

Here's an example of how to connect and subscribe to global bet updates using Node.js:

```typescript
import { APIRealtimeClient } from 'common/api/websocket-client'

const client = new APIRealtimeClient('wss://api.manifold.markets/ws')

// Subscribe to all new bets
client.subscribe(['global/new-bet'], (msg) => {
  console.log('New bet:', msg.data)
})

// Subscribe to a specific market's updates
client.subscribe(['contract/1234'], (msg) => {
  console.log('Market update:', msg.data)
})
```

Or using plain WebSocket:

```javascript
const ws = new WebSocket('wss://api.manifold.markets/ws')
let txid = 0

ws.onopen = () => {
  // Subscribe to global bets
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      txid: txid++,
      topics: ['global/new-bet'],
    })
  )
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.type === 'broadcast') {
    console.log('Received broadcast:', msg.data)
  }
}

// Send periodic pings to keep connection alive
setInterval(() => {
  ws.send(
    JSON.stringify({
      type: 'ping',
      txid: txid++,
    })
  )
}, 30000)
```

The server will send broadcast messages in this format:

```json
{
  "type": "broadcast",
  "topic": "global/new-bet",
  "data": {
    // Bet data
  }
}
```

Note: The websocket connection requires periodic pings (every 30-60 seconds) to stay alive. If no ping is received for 60 seconds, the connection will be terminated.

## Internal API

Manifold has some internal API endpoints that are not part of the official API. These are largely undocumented, but a few are mentioned here for third-party use until a more permanent solution is implimented. These endpoints are not preceeded by `/v0` and are even more subject to sudden changes than the official API endpoints.

### `POST /unresolve`

Unresolves a market. Requires auth.

Parameters:

- `contractId`: The ID of the market to unresolve.

## Changelog

- 2024-10-30: Remove undefined parameter from `/v0/market/[marketId]/sell` and remove `sell-shares-dpm` endpoint
- 2024-02-01: Add Manifold Love endpoints `/get-lovers`, `/get-lover-answers?userId=[user_id]`, `/get-compatibility-questions`
- 2023-12-19: Formatting & copy improvements. Updated parameters and return types.
- 2023-12-18: `manifold.markets/api` -> `api.manifold.markets`. Please migrate old code.
- 2023-12-12: New flat api structure (reverted)
- 2023-10-27: Update `/search-markets` to allow all the same search options as our search
- 2023-09-29: Add `/managrams` and `/managram` endpoints
- 2023-05-15: Change the response of the `/market/{marketId}/sell` POST endpoint from `{"status": "success"}` to a full `Bet`, with an additional `"status": "success"` field
- 2023-04-03: Add `/market/[marketId]/group` POST endpoint.
- 2023-03-21: Add `/market/[marketId]/positions` and `/search-markets` endpoints
- 2022-11-22: Update /market GET to remove `bets` and `comments`
- 2022-10-17: Update /market POST to allow `visibility` and `groupId`; mark `closeTime` as optional; remove `tags`
- 2022-09-24: Expand market POST docs to include new market types (`PSEUDO_NUMERIC`, `MULTIPLE_CHOICE`)
- 2022-07-15: Add user by username and user by ID APIs
- 2022-06-08: Add paging to markets endpoint
- 2022-06-05: Add new authorized write endpoints
- 2022-02-28: Add `resolutionTime` to markets, change `closeTime` definition
- 2022-02-19: Removed user IDs from bets
- 2022-02-17: Released our v0 API, with `/markets`, `/market/[marketId]`, and `/slug/[slugId]`

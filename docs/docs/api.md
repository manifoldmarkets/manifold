---
id: api
slug: /api
---

# Manifold API

Programatic access to [Manifold](https://manifold.markets).

:::caution

Our API is still in alpha — things may change or break at any time!

If you have questions, come chat with us on [Discord](https://discord.com/invite/eHQBNBqXuh). We’d love to hear about what you build!

:::

:::note

To see docs for the old vercel-hosted api, check out the [old docs on github](https://github.com/manifoldmarkets/manifold/blob/3134275d2e1198b50bd82cd5593e3d17882658d9/docs/docs/api.md)

:::

# Get Started

In your terminal

```bash
curl "https://api.manifold.markets/v0/markets?limit=1" -X GET
```

You can also [go to the url directly](https://api.manifold.markets/v0/markets?limit=1) in your browser to see the response of any GET request

GET requests with parameters should have the parameters in the query string. POST and PUT requests should have a body with a JSON object with one property per parameter.

```bash
 curl "https://api.manifold.markets/v0/bet" -X POST -H 'Content-Type: application/json' \
    -H 'Authorization: Key {...}' \
    --data-raw '{"amount":1, \
                 "outcome":"YES", \
                 "contractId":"i95HLfK9N6hu5H7orfNj"}'
```

API responses should always either have a body with a JSON result object (if
the response was a 200) or with a JSON object representing an error (if the
response was a 4xx or 5xx).

All times are UNIX timestamps in milliseconds since epoch.

As a point of naming, topics (the tags on questions) are called "groups" in the code and in the api, and questions are called "contracts" in the code but "markets" in the api.

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

Feel free to use the API for any purpose you'd like. We ask that you:

- Keep your bets to less than 10 per minute, amortized (transient spikes of over 10/min are okay).
- Keep your reads to less than 100 per second.

## Fees

- A non-refundable transaction fee of $M0.25 will be levied on any bet, sell, or limit order placed through the API, or by any account marked as a bot.
- Comments placed through the API will incur a $M1 transaction fee.

## Trade history dumps

For data analysis and backtesting purposes, you can bulk download all markets and bets/trades on the platform.

- [Markets dump](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-markets-04082023.json.zip?alt=media&token=7e18a376-6ac3-4d66-a9a0-552b967f2fe8) (10MB)
- [Bets dump](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-bets-04082023.zip?alt=media&token=c3ffdfbd-6769-48e3-8cfc-4fc93c2443f3) (436MB)

Dumps last updated: August 8, 2023

## Useful resources

We're open source!

[common/src/api/schema.ts](https://github.com/manifoldmarkets/manifold/tree/main/common/src/api/schema.ts) - type definitions of the apis, including parameters and return values

## Endpoints

### `GET /v0/users`

Lists all users, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many users to return. The maximum is 1000 and the default is 500.
- `before`: Optional. Include only users created before this time.
  - For example, if you ask for the most recent 10 users, and then perform a secondquery for 10 more users with `before=[the id of the 10th user]`, you will get users 11 through 20.

Example request

```bash
curl "https://api.manifold.markets/v0/users?limit=1" -X GET
```

Example response

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

Response type: Array of `LiteUser`

```tsx
// Basic information about a user
type LiteUser = {
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
  profitCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }
}
```

### `GET /v0/user`

Get info on a user

Parameters:

- `username`: Optional. Get the user by their username. Remember that usernames may change.
- `id`: Optional. Get the user by their unique ID. Many other API endpoints return this as the `userId`.

Response type: `LiteUser`

### `GET /v0/me`

Returns the authenticated user

Response type: `LiteUser`

### `GET /v0/groups`

Get all topics, in order of descending creation time, 500 at a time

Parameters:

- `beforeTime`: Optional. Get only topics created before this time.
- `availableToUserId`: Optional. Get only topics that the user has access to.

### `GET /v0/group`

Get info on a topic

Parameters:

- `id`: Optional. Gets a topic by it's unique ID.
- `slug`: Optional: Gets a topic by it's slug.

### `GET /v0/markets`

List all questions, ordered by creation date descending.

Parameters:

- `limit`: Optional. How many markets to return. The maximum is 1000 and the default is 500.
- `before`: Optional. The ID of the market before which the list will start. For
  example, if you ask for the most recent 10 markets, and then perform a second
  query for 10 more markets with `before=[the id of the 10th market]`, you will
  get markets 11 through 20.
- `userId`: Optional. Include only markets created by this user.
- `groupId`: Optional. Include only markets tagged with this topic.

Example request

```bash
curl "https://api.manifold.markets/v0/markets?limit=1" -X GET
```

Example response

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
    "p":0.08281474972181882,
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
]
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

  // Market attributes.
  createdTime: number // When market created
  closeTime?: number // Min of creator's chosen date, and resolutionTime
  question: string
  slug: string

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
}
```

### `GET /v0/search-markets`

Search, filter, and sort markets, same as the [browse page](https://manifold.markets/browse). This is less stable than the other apis

Parameters:

- `term`: the search query in question. Can be empty string.
- `sort`: Optional. `score` (default), `newest`, `liquidity`, or ... (see code)
- `filter`: Optional. Closing state. `all` (default), `open`, `closed`, `resolved`, `closing-this-month`, or `closing-next-month`.
- `contractType`: Optional. `ALL` (default), `BINARY`, `MULTIPLE_CHOICE`, `BOUNTY`, `POLL`, or ... (see code)
- `topicSlug`: Optional. Only include questions with the topic tag with this slug.
- `creatorId`: Optional. Only include questions created by the user with this ID.
- `limit`: Optional. Number of contracts to return from 0 to 1000. Default 100.
- `offset`: Optional. Number of contracts to skip. Use with limit to paginate the results.

Example request

```bash
curl "https://api.manifold.markets/v0/search-markets?term=biden&sort=liquidity&filter=resolved&contractType=BINARY&limit=2" -X GET
```

Response type: Array of `LiteMarket`.

### `GET /v0/market`

Get a single market. Includes answers, but not bets and comments. Use `/bets` or `/comments` with a market ID to retrieve bets or
comments.

Parameters:

- `id`: Optional. Get the market by its unique ID. Many other API endpoints return this as `contractId`.
- `slug`: Optional. Get the market by slug.
- `lite`: Optional. `true` or `false` (default). Whether to return a `FullMarket` or `LiteMarket`

Example request

```bash
curl "https://api.manifold.markets/v0/market?id=3zspH9sSzMlbFQLn9GKR" -X GET
```

Example response

```json
{
  "id": "lEoqtnDgJzft6apSKzYK",
  "creatorUsername": "Angela",
  "creatorName": "Angela",
  "createdTime": 1655258914863,
  "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/user-images%2FAngela%2F50463444807_edfd4598d6_o.jpeg?alt=media&token=ef44e13b-2e6c-4498-b9c4-8e38bdaf1476",
  "closeTime": 1655265001448,
  "question": "What is good?",
  "description": "Resolves proportionally to the answer(s) which I find most compelling. (Obviously I’ll refrain from giving my own answers)\n\n(Please have at it with philosophy, ethics, etc etc)\n\n\nContract resolved automatically.",
  "url": "https://manifold.markets/Angela/what-is-good",
  "pool": null,
  "outcomeType": "FREE_RESPONSE",
  "mechanism": "dpm-2",
  "volume": 112,
  "volume24Hours": 0,
  "isResolved": true,
  "resolution": "MKT",
  "resolutionTime": 1655265001448,
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
  answers?: Answer[] // dpm-2 markets only
  description: JSONContent // Rich text content. See https://tiptap.dev/guide/output#option-1-json
  textDescription: string // string description without formatting, images, or embeds
  groupSlugs?: string[] // groups which the market is a part of
}
```

### `GET /v0/positions`

Get positions information about a single market.

Parameters:

- `id`: The market ID
- `order`: `shares` or `profit` (default). The field to order results by.
- `top`: Optional. The number of top positions (ordered by `order`) to return.
- `bottom`: Optional. The number of bottom positions (ordered by `order`) to return.
- `userId`: Optional. The user ID to query by. If provided, only the position for this user will be returned.

Example request

```
https://api.manifold.markets/v0/positions?id=kupKInoLsjMuiDiNfogm&top=1&bottom=1
```

Example response

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
- `replyToCommentId`: Optional. Makes this a bet reply to the comment with this ID.

Response type: A `Bet`

Resquires Authentication.

### `POST /v0/cancel-bet`

Cancel a limit order.

Parameter:

- `betId`: the ID of the bet

Requires Authentication.

Response type: A `Bet`

### `POST /v0/sell-shares`

Sell shares in a market.

Parameters:

- `contractId`: the ID of the market you're selling your position in.
- `outcome`: `YES` or `NO`. Optional. Which kind of shares you are selling - defaults to the kind you have.
- `shares`: Optional. How many shares you are selling - defaults to all.
- `answerId`: Required on multi choice. The ID of the answer you are selling your position in.

Requires Authentication.

Response type: A `Bet`

### `POST /v0/sell-shares-dpm`

Sell a position in a multi choice or "free response" market that's on the deprecated contract mechanism `dpm-2`. The mechanism is inferior in that you can only bet YES and you can only sell an entire bet.

Parameters:

- `contractId`: the ID of the market
- `betId`: the ID of the bet to sell

Requires Authentication.

### `POST /v0/create-market`

Creates a new market.

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
- `shouldAnswerSumToOne`: Optional. If `true`, makes this market auto-arbitrage so that probabilities add up to 100% and restricts market resolution accordingly.

For bountied questions, you must also provide:

- `totalBounty`: The total amount of mana to be distributed to the best answers.

For polls, you must also provide:

- `answers`: An array of strings, each of which will be an option for the poll.

Requires Authentication.

Response type: `LiteMarket`

### `POST /v0/update-tag`

Add or remove a topic tag from a market

- `contractId`: The ID of the market
- `groupId`: The ID of the topic.
- `remove`: Optional. Set to `true` to un-tag the topic.

Requires Authentication. Must be admin/moderator/creator of group if curated/private. Must be market creator or site moderator if group is public.

### `POST /v0/add-liquidity`

Add mana to liquidity pool. Does not boost.

- `contractId`: The id of the market
- `amount`: Amount of M$ to add

Requires Authentication.

Response type: something

### `POST /v0/add-bounty`

Add mana to a bounty question's reward.

Parameters:

- `contractId`: The ID of the market
- `amount`: Amount of M$ to add

Requires Authentication.

Response type: `Txn`

### `POST /v0/award-bounty`

Distribute a bounty market reward

- `contractId`: The ID of the market
- `amount`: The amount of bounty to award, in M$.
- `commentId`: The comment to award the bounty to.

Requires Authentication.

Response type `Txn`

### `POST /v0/close`

Set when trading halts on a market

- `contractId`: The ID of the market
- `closeTime`: Optional. Milliseconds since the epoch to close the market at. If not provided, close the market immediately.

Requires Authentication.

### `POST /v0/resolve`

Resolves a market

Parameters:

For binary markets:

- `outcome`: One of `YES`, `NO`, `MKT`, or `CANCEL`.
- `probabilityInt`: Optional. The probability to use for `MKT` resolution.

For free response or multiple choice markets:

- `outcome`: One of `MKT`, `CANCEL`, or a `number` indicating the answer index.
- `resolutions`: An array of `{ answer, pct }` objects to use as the weights for resolving in favor of multiple free response options. Can only be set with `MKT` outcome. Note that the total weights must add to 100.

For numeric markets:

- `outcome`: One of `CANCEL`, or a `number` indicating the selected numeric bucket ID.
- `value`: The value that the market resolves to.
- `probabilityInt`: Required if `value` is present. Should be equal to
  - If log scale: `log10(value - min + 1) / log10(max - min + 1)`
  - Otherwise: `(value - min) / (max - min)`

Requires Authentication.

### `GET /v0/comments`

Gets a list of comments for a contract, ordered by creation date descending.

Parameters:

- `contractId`: Optional. The ID of the market to read comments of.
- `contractSlug`: Optional. The slug of the market to read comments of.
- `limit`. Optional. How many comments to return
- `page`. Optional. For pagination with `limit`
- `userId`: Optional. Get only comments created by this user.

### `POST /v0/comment`

Creates a comment in the specified market. Only supports top-level comments for now.

Parameters:

- `contractId`: The ID of the market to comment on.
- `content`: The comment to post, formatted as [TipTap json](https://tiptap.dev/guide/output#option-1-json), OR
- `html`: The comment to post, formatted as an HTML string, OR
- `markdown`: The comment to post, formatted as a markdown string.

Requires Authentication.

<!-- ### `POST /v0/hide-comment`

Hides a comment for all users.

Parameter:

- `commentPath`: ...

Requires Authentication. Must be a moderator. -->

### `GET /v0/bets`

Gets a list of bets, ordered by creation date descending.

Parameters:

- `userId`: Optional. Include only bets by the user with this ID.
- `username`: Optional. Include only bets by the user with this username.
- `contractId`: Optional. Include only bets on the market with this ID.
- `contractSlug`: Optional. Include only bets on the market with this slug.
- `limit`: Optional. How many bets to return.
- `before`: Optional. Include only bets created before the bet with this ID.
  - For
    example, if you ask for the most recent 10 bets, and then perform a second
    query for 10 more bets with `before=[the id of the 10th bet]`, you will
    get bets 11 through 20.
- `after`: Optional. Include only bets created after the bet with this ID.
  - For example, if you request the 10 most recent bets and then perform a second query with `after=[the id of the 1st bet]`, you will receive up to 10 new bets, if available.
- `kinds`: Optional. Specifies subsets of bets to return. Possible kinds: `open-limit` (open limit orders.)
- `order`: Optional. `asc` or `desc` (default). The sorting order for returned bets.

Example request

```bash
curl "https://api.manifold.markets/v0/bets?username=Manifold&contractSlug=will-i-be-able-to-place-a-limit-ord" -X GET
```

Response type: An array of `Bet`.

Example response

```json
[
  // Limit bet, partially filled.
  {
    "isFilled": false,
    "amount": 15.596681605353808,
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
    "orderAmount": 100,
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

### `GET /v0/managrams`

Gets a list of managrams, ordered by creation time descending.

Parameters:

- `toId`: Optional. Get only managrams sent to this user.
- `fromId`: Optional. Get only managrams sent from this user.
- `limit`: Optional. How many managrams to get.
- `before`: Optional. The `createdTime` before which you want managrams
- `after`: Optional. The `createdTime` after which you want managrams

Example request

```bash
curl "https://api.manifold.markets/v0/managrams?toId=IPTOzEqrpkWmEzh6hwvAyY9PqFb2" -X GET
```

Example response

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

### `POST /v0/send-mana`

Send a managram to another user.

Parameters:

- `toIds`: An array of user IDs to send managrams to.
- `amount`: The amount of mana (must be >= 10) to send to each user.
- `message`: Optional. A message to include with the managram.

Example body

```json
{
  "amount": 10,
  "toIds": ["AJwLWoo3xue32XIiAVrL5SyR1WB2"],
  "message": "hi!"
}
```

### `GET /v0/leagues`

Gets a list of league standings for a particular user or season

Parameters:

- `userId`: Optional. Returns only leagues for this user.
- `season`: Optional. Number. Returns only a particular season.
- `cohort`: Optional. String. The snake-cased quirky name of a league - returns only this particular league

## Changelog

- 2023-12-12: Document big migration to `api.manifold.markets` with flat api structure.
  - Formatting and copy improvements.
  - Corrected parameters
- 2023-10-27: Update `/search-markets` to allow all the same search options as our search.
- 2023-09-29: Add `/managrams` and `/managram` endpoints
- 2023-05-15: Change the response of the `/market/{marketId}/sell` POST endpoint from
  `{"status": "success"}` to a full `Bet`, with an additional `"status": "success"` field.
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

// ---------------------------------------------------------------------------
// scope.ts — the single, auditable catalog of WHAT we export and WHERE user
// ids hide. This file is deliberately declarative so a reviewer (or legal) can
// read exactly which fields are pseudonymized and which are stripped, without
// reading the transform code. Every entry cites the source-of-truth type.
//
// Sources: common/src/{contract,bet,answer,liquidity-provision,txn,comment}.ts
//          backend/supabase/*.sql
// ---------------------------------------------------------------------------

// 1.2.0: usernames rewritten inside URLs, paths and prose (identity.ts);
// contract_bets.cancel_time_reliable; perp/sports/multi keys vetted below;
// answers.p typed.
export const SCHEMA_VERSION = '1.2.0'

export type Segment = 'A' | 'B' | 'C'

export const SEGMENT_LABEL: Record<Segment, string> = {
  A: 'reasoning-corpus',
  B: 'question-corpus',
  C: 'probability-series',
}

export type TableName =
  | 'contracts'
  | 'answers'
  | 'contract_comments'
  | 'contract_bets'
  | 'contract_liquidity'
  | 'txns'
  | 'bot_accounts'

export interface TableSpec {
  name: TableName
  segment: Segment
  // The delivered column that carries the parent contract id, or null when the
  // association is not a simple column (txns — see extract.ts / txnContractFilter).
  contractIdColumn: string | null
  // Does the row carry a jsonb `data` blob that must be walked? (answers do not.)
  hasDataBlob: boolean
  // Top-level `data.*` keys whose VALUE is a raw user id -> pseudonymize in place.
  userIdDataFields: string[]
  // Native (column) user-id fields -> pseudonymize in place.
  userIdColumns: string[]
  // Denormalized identity we STRIP entirely (name / handle / avatar). Pseudonymizing
  // the id next to a plaintext username would defeat the point.
  stripDataFields: string[]
  // Delivered pg COLUMNS to drop before writing (search-index tsvectors etc. —
  // noise for a licensee, never identity).
  stripColumns: string[]
  // Every OTHER top-level `data` key we have vetted as identity-free and pass
  // through untouched. Any key not in (allowed ∪ userIdDataFields ∪ strips) fails
  // validation — an ALLOWLIST, so an unvetted legacy key aborts the run instead
  // of leaking silently. Lists were built from a full key inventory of the dev DB
  // plus the common/src types; a prod key outside them is exactly the situation
  // that needs a human decision. (null = keys checked structurally elsewhere: txns.)
  allowedDataFields: string[] | null
}

export const TABLES: Record<TableName, TableSpec> = {
  // Segment B — question-corpus
  contracts: {
    name: 'contracts',
    segment: 'B',
    contractIdColumn: 'id',
    hasDataBlob: true,
    // common/src/contract.ts:54-108
    userIdDataFields: [
      'creatorId',
      'resolverId',
      'unlistedById',
      'loverUserId1',
      'loverUserId2',
      'matchCreatorId',
    ],
    userIdColumns: ['creator_id'], // backend/supabase/contracts.sql:7
    // contract.ts:55-58 (creator identity + account-age vector). Note:
    // data.answers[] handled structurally in redact.ts; data.description
    // @mentions handled structurally too.
    stripDataFields: [
      'creatorName',
      'creatorUsername',
      'creatorAvatarUrl',
      'creatorCreatedTime',
      // legacy keys found by DB key inventory, absent from current contract.ts:
      'resolutionReports', // array of RAW reporter user ids (moderation data)
      'username', // stray legacy denormalized handle
      'uniqueBettors', // legacy; not needed, shape varies
      'groupDetails', // legacy embedded group metadata (may carry creator info)
      'test-92fb2d00bfc8', // stray test key (dev DB)
      // legacy DPM per-user liquidity map — an object KEYED by raw user id
      // ({"<uid>": {"NO": 13.6}}). Real liquidity data ships in the
      // contract_liquidity table; this legacy denormalization is dropped.
      'liquidity',
    ],
    stripColumns: ['question_fts', 'question_nostop_fts', 'description_fts'],
    allowedDataFields: [
      'addAnswersMode',
      'aiDescription',
      'answers',
      'autoResolution',
      'boosted',
      'bountyLeft',
      'bountyPaid',
      'bountyTxns',
      'category',
      'cfmmConversionTime',
      'closeEmailsSent',
      'closeTime',
      'collectedFees',
      'conversionScore',
      'coverImageUrl',
      'createdTime',
      'creatorBannedFromBetting',
      'dailyScore',
      'deleted',
      'description',
      'display',
      'dpmPool',
      'elasticity',
      'followerCount',
      'freshnessScore',
      'fundingRate',
      'fundingSensitivity',
      'gptCommentSummary',
      'groupIds',
      'groupNames',
      'groupSlugs',
      'id',
      'importanceScore',
      'initialPool',
      'initialProbability',
      'initialSubsidy',
      'isAutoBounty',
      'isLogScale',
      'isLove',
      'isPolitics',
      'isRanked',
      'isResolved',
      'isSpicePayout',
      'isSubsidized',
      'isTwitchContract',
      'k',
      'lastBetTime',
      'lastCommentTime',
      'lastFundingTime',
      'lastUpdatedTime',
      'likedByUserCount',
      'manaLimitPerUser',
      'marketTier',
      'maxSelections',
      'randomCloseAfterTime',
      'specialLiquidityPerAnswer',
      'tier' /* legacy string predecessor of marketTier */,
      'max',
      'maxFundingRate',
      'maxLeverage',
      'maxOraclePriceAgeMs',
      'maxPositionNotionalFraction',
      'mechanism',
      'min',
      'mostPopularScore',
      'nonPredictive',
      'oldPool',
      'oldTotalBets',
      'options',
      'oracleFeedId',
      'oraclePrice',
      'oraclePriceTime',
      'outcomeType',
      'outcomes',
      'p',
      'phantomShares',
      'pollType',
      'pool',
      'poolLong',
      'poolShort',
      'popularityScore',
      'prizeTotal',
      'prob',
      'probChanges',
      'question',
      'realAnte',
      'resolution',
      'resolutionProbability',
      'resolutionTime',
      'resolutionValue',
      'resolutions',
      'shouldAnswersSumToOne',
      'siblingContractId',
      'slug',
      'sort',
      'sportsAwayScore',
      'sportsEventId',
      'sportsHomeScore',
      'sportsLeague',
      'sportsLiveMinute',
      'sportsLiveStatus',
      'sportsLiveUpdatedTime',
      'sportsPenAway',
      'sportsPenHome',
      'sportsScoreDuration',
      'sportsStartTimestamp',
      'startPool',
      'subsidyPool',
      'takerAPIOrdersDisabled',
      'timezone',
      'token',
      // prod-only legacy keys (absent from the dev DB the first inventory was
      // built on; all identity-free scalars, verified against prod):
      //   wasDpm          boolean, "this was a DPM market" (596 rows)
      //   isSubsidised    misspelled predecessor of isSubsidized (1 row)
      //   uniqueViewCount number, always 0 (5 rows)
      'wasDpm',
      'isSubsidised',
      'uniqueViewCount',
      'totalBets',
      'totalBounty',
      'totalLiquidity',
      'totalShares',
      'uniqueBettorCount',
      'uniqueBettorCountDay',
      'unit',
      'viewCount',
      'visibility',
      'volume',
      'volume24Hours',
      'volume24Hrs',
      'voterVisibility',
      'wasPrivate',
      // Added on main after this export was written (common/src/contract.ts), vetted
      // 2026-10-22 against the types and the dev key inventory. All are numbers,
      // enums, provider strings or engine state; none names a user.
      //   initialProbabilities  {answerId: number}, multi markets' opening probs
      //   perps: fee/funding config, frozen launch pools, open interest, feed
      //   health {checkedAt, status, reason?, expiresAt?}, solvency halt (time +
      //   engine error message), short ticker label, resolution price
      //   sportsHomeTeam/AwayTeam  provider team names; sportsMarketType enum
      'initialProbabilities',
      'fundingPeriodMs',
      'takerFeeBps',
      'takerFeeImpact',
      'takerFeeApiBps',
      'ticker',
      'initialPoolLong',
      'initialPoolShort',
      'openInterestLong',
      'openInterestShort',
      'oracleSourceTime',
      'oracleFeedHealth',
      'resolvedOraclePrice',
      'solvencyHaltTime',
      'solvencyHaltReason',
      'sportsHomeTeam',
      'sportsAwayTeam',
      'sportsMarketType',
    ],
  },
  // Segment B — answers are fully columnar (no data blob). common/src/answer.ts,
  // backend/supabase/answers.sql:20,26
  answers: {
    name: 'answers',
    segment: 'B',
    contractIdColumn: 'contract_id',
    hasDataBlob: false,
    userIdDataFields: [],
    userIdColumns: ['user_id', 'resolver_id'],
    stripDataFields: [],
    stripColumns: ['text_fts'],
    allowedDataFields: [],
  },
  // Segment A — reasoning-corpus. The richest hiding spot for ids. comment.ts:10-63
  contract_comments: {
    name: 'contract_comments',
    segment: 'A',
    contractIdColumn: 'contract_id',
    hasDataBlob: true,
    userIdDataFields: [
      'userId',
      'hiderId',
      'pinnerId',
      'deleterId',
      'bettorId',
    ],
    userIdColumns: ['user_id'], // contract_comments.sql:11
    stripDataFields: [
      'userName',
      'userUsername',
      'userAvatarUrl',
      'bettorUsername',
      'bettorName',
      // legacy variants found by DB key inventory:
      'bettorUserUsername',
      'bettorAvatarUrl',
    ],
    stripColumns: [],
    // NB: data.content (rich text) is walked for @mention ids + text scrub in redact.ts
    allowedDataFields: [
      'answerOutcome',
      'betAmount',
      'betAnswerId',
      'betId',
      'betLimitProb',
      'betOrderAmount',
      'betOutcome',
      'betReplyAmountsByOutcome',
      'betReplyVolume',
      'betToken',
      'bountiesAwarded',
      'bountyAwarded',
      'commentType',
      'commenterPositionAnswerId',
      'commenterPositionOutcome',
      'commenterPositionProb',
      'commenterPositionShares',
      'commentorPositionAnswerId',
      'commentorPositionOutcome',
      'commentorPositionProb',
      'commentorPositionShares',
      'content',
      'contractId',
      'contractQuestion',
      'contractSlug',
      'createdTime',
      'deleted',
      'deletedTime',
      'editedTime',
      'hidden',
      'hiddenTime',
      'id',
      'isApi',
      'isRepost',
      'likes',
      'pinned',
      'pinnedTime',
      'replyToCommentId',
      'text',
      'visibility',
    ],
  },
  // Segment C — probability-series
  contract_bets: {
    name: 'contract_bets',
    segment: 'C',
    contractIdColumn: 'contract_id',
    hasDataBlob: true,
    userIdDataFields: ['userId'], // common/src/bet.ts:22
    userIdColumns: ['user_id'], // contract_bets.sql:20
    // legacy bets denormalized the bettor's display identity into the blob
    // (~20% of dev rows) — absent from the current Bet type but very present in
    // old data. Found by DB key inventory. 'comment' (Jan-2022 era) embeds a
    // whole comment object incl. userName/userUsername/userAvatarUrl and
    // unscrubbed text — comments are delivered via contract_comments instead.
    stripDataFields: ['userName', 'userUsername', 'userAvatarUrl', 'comment'],
    stripColumns: [],
    allowedDataFields: [
      'amount',
      'answerId',
      'betGroupId',
      'challengeSlug',
      'contractId',
      'createdTime',
      'dpmShares',
      'dpmWeight',
      'expiresAt',
      'fees',
      'fills',
      'id',
      'isAnte',
      'isApi',
      'isCancelled',
      'isChallenge',
      'isFilled',
      'isInterestClaim',
      'isLiquidityProvision',
      'isRebalance',
      'isRedemption',
      'isSold',
      'limitProb',
      'loanAmount',
      'orderAmount',
      'outcome',
      'probAfter',
      'probAverage',
      'probBefore',
      'replyToCommentId',
      'sale',
      'shares',
      'silent',
      'updatedTime',
      'value',
      'visibility',
    ],
  },
  contract_liquidity: {
    name: 'contract_liquidity',
    segment: 'C',
    contractIdColumn: 'contract_id',
    hasDataBlob: true,
    userIdDataFields: ['userId'], // common/src/liquidity-provision.ts:3
    userIdColumns: ['user_id'], // contract_liquidity.sql:8
    stripDataFields: [],
    stripColumns: [],
    allowedDataFields: [
      'amount',
      'answerId',
      'constractId' /* [sic] legacy typo of contractId */,
      'contractId',
      'createdTime',
      'id',
      'isAnte',
      'liquidity',
      'p',
      'pool',
      'probability',
    ],
  },
  // txns: polymorphic ledger. from_id/to_id are user ids ONLY when the matching
  // *_type is 'USER' (else CONTRACT/CHARITY/BANK/AD/LEAGUE) — handled specially
  // in redact.ts. Nested data user ids handled structurally. common/src/txn.ts
  // Scope: the FULL ledger, minus rows referencing an out-of-scope contract
  // (see extract.ts) — so platform-wide categories (bonuses, transfers,
  // purchases, loans, league prizes …) ship, and unlisted/deleted markets stay
  // invisible. Free-text messages and external payment metadata are stripped
  // (TXN_INNER_STRIP); contract references nested in payloads are scrubbed
  // against the scope set in redactTxn.
  txns: {
    name: 'txns',
    segment: 'C',
    contractIdColumn: null,
    hasDataBlob: true,
    userIdDataFields: [], // see TXN_DATA_USER_ID_* below (nested under data.data)
    userIdColumns: [], // from_id/to_id are conditional — see redactTxn
    // Legacy txns duplicated the WHOLE txn into the blob, including raw
    // fromId/toId and a human-readable description with real display names
    // ("Wrenna tipped M$10 to Pikeling…"). All are dupes of delivered columns —
    // strip them. Found by DB key inventory.
    stripDataFields: [
      'fromId',
      'toId',
      'fromType',
      'toType',
      'description',
      'id',
      'amount',
      'category',
      'token',
      'createdTime',
    ],
    stripColumns: [],
    allowedDataFields: null, // txn keys are checked via TXN_*_ALLOWED below
  },
  // Accounts carrying the user-level bot flag (users.data.isBot), delivered as
  // PSEUDONYMS — joinable against user_id in every table, so a licensee can
  // include/exclude/study algorithmic flow without a users table. Complements
  // the per-row is_api flag on bets.
  bot_accounts: {
    name: 'bot_accounts',
    segment: 'C',
    contractIdColumn: null,
    hasDataBlob: false,
    userIdDataFields: [],
    userIdColumns: ['user_id'],
    stripDataFields: [],
    stripColumns: [],
    allowedDataFields: [],
  },
}

export const ALL_TABLES = Object.values(TABLES)

// ---- txn specifics --------------------------------------------------------

// The polymorphic endpoint value that means "this id is a user id".
export const TXN_USER_ENDPOINT_TYPE = 'USER' // common/src/txn.ts SourceType

// User ids nested inside txn `data.data`. Some are scalars, some arrays.
// common/src/txn.ts:145-149 (UniqueBettorBonus), :123-126 (Tip), etc.
// The referral/cancel/league ids belong to categories that are not
// contract-linked today, but pseudonymizing them is drift-safe.
export const TXN_DATA_USER_ID_SCALARS = [
  'uniqueNewBettorId',
  'referredById',
  'referredId',
  'referredUserId',
  'referrerId',
  'targetId',
  'canceledBy',
  'cancelledBy', // both spellings exist in the data
  'user_id',
  // legacy, prod only: 5 contract-linked rows carry a raw 28-char uid here.
  'fromUserId',
]
export const TXN_DATA_USER_ID_ARRAYS = ['uniqueBettorIds']

// Allowlists for txn blob keys (see TableSpec.allowedDataFields — txns are
// polymorphic so the gate uses these two sets instead).
// Top-level `data` keys that survive the strip list and are vetted:
export const TXN_OUTER_ALLOWED = ['data', 'certId', 'qfId', 'cashoutable']
// `data.data` payload keys STRIPPED before delivery (the full ledger now ships,
// so these can no longer hide behind the contract-linkage filter):
//  - 'message': managram (MANA_PAYMENT) free text — private user-to-user
//    messages, unscrubbed; not licensed content.
//  - external payment / merch metadata: processor ids, fiat amounts, order and
//    shipping records (merch orders can carry addresses).
//  - 'betPaths': lootbox bookkeeping — firestore paths embedding contract ids
//    that may be out of scope (would leak unlisted-market ids).
// Vetted per-category via DB key inventory (dev, 2026-07); an unknown prod key
// still trips the gate and forces a human decision.
export const TXN_INNER_STRIP = [
  'message',
  'stripeTransactionId',
  'daimoEventId',
  'daimoPaymentId',
  'daimoSessionId',
  'daimoTxHash',
  'iapTransactionId',
  'merchantSessionId',
  'sessionId',
  'transactionId',
  'paidInCents',
  'payoutInDollars',
  'shippingCost',
  'merchOrder',
  'shopOrderId',
  'printfulOrderId',
  'variantId',
  'ticketOrder',
  'isBulkPurchase',
  'isFirstCryptoPurchase',
  'betPaths',
  // prod-only (full-clone key inventory):
  'offerId', // MANA_PURCHASE payment-offer token — payment metadata
  'reportId', // ADMIN_REWARD internal moderation-report reference
]
// `data.data` payload keys, vetted across categories (DB inventory + txn.ts).
export const TXN_INNER_ALLOWED = [
  'amountRepaid',
  'answerId',
  'automated',
  'bonusAmount',
  'bonusPct',
  'bonusType',
  'boostId',
  'cashoutable',
  'charityId',
  'closePrice',
  'cohort',
  'comment',
  'commentId',
  'contractId',
  'countsAsProfit',
  'created_time',
  'currentBettingStreak',
  'deposit',
  'direction',
  'distributions',
  'division',
  'dollarDays',
  'effectiveTier',
  'entryId',
  'entryPrice',
  'giveawayNum',
  'groupId',
  'insertTime',
  'isAutoRenewal',
  'isCashout5kLimit',
  'isLast',
  'isPartner',
  'itemId',
  'leagueBonus',
  'leverage',
  'lotteryNum',
  'mana_earned',
  'mana_earned_breakdown',
  'numTickets',
  'originalTxnId',
  'payoutStartTime',
  'pnl',
  'postId',
  'q_and_a_id',
  'questCount',
  'questMultiplier',
  'questType',
  'rank',
  'rank_snapshot',
  'reason',
  'referralMultiplier',
  'referredContractId',
  'refund',
  'reverted',
  'revertsTxnId',
  'season',
  'siblingId',
  'sizeDelta',
  'streakMultiplier',
  'supporterBonus',
  'supporterDiscount',
  'sweepstakesNum',
  'ticketId',
  'type',
  'uniqueBettors',
  'uniqueTraderMultiplier',
  'upgradeCredit',
  'visibility',
  'voidedReason',
  // prod-only, contract-linked, vetted against prod values (all identity-free):
  //   awardType          string, always 'plus' (10 rows)
  //   isBTEbackfill      boolean, CREATE_CONTRACT_ANTE backfill marker (108)
  //   noShareDays / yesShareDays  numbers, share-day accounting (783 each)
  //   partnerDollarBonus number, always 0.1 (7 rows)
  //   sellProb           number, a probability (248 rows)
  // NB: 'comment' above is a comment ID on BOUNTY_AWARDED (max 20 chars in
  // prod), NOT free text — checked, so it stays allowed.
  'awardType',
  'isBTEbackfill',
  'noShareDays',
  'partnerDollarBonus',
  'sellProb',
  'yesShareDays',
  // prod-only, surfaced by the unknown-key gate / full-clone key inventory
  // vetted against clone values — all identity-free:
  //   backfill             boolean, REFERRAL backfill marker (162)
  //   isJul24Reimbursement boolean, MANA_PAYMENT reimbursement marker (58)
  //   questAmount          number (4)
  //   freeLoanRepaid / interestRepaid / marginRepaid  numbers, LOAN_PAYMENT (4 each)
  //   items                SHOP_PURCHASE [{q, key:"digital:…"}] — digital only,
  //                        no shipping/PII (26)
  //   personalizedOffer    boolean, always true (3)
  //   reverses             txn id, like revertsTxnId (5, CHARITY)
  //   updateType           enum 'resolved'|'under review'|'new'|'' (5,633)
  'backfill',
  'isJul24Reimbursement',
  'questAmount',
  'freeLoanRepaid',
  'interestRepaid',
  'marginRepaid',
  'items',
  'personalizedOffer',
  'reverses',
  'updateType',
  // perp txns added on main after this export was written (common/src/txn.ts):
  //   feeBps / feeBase  PERP_TAKER_FEE effective and configured rate (numbers)
  //   finalPrice        PERP_RESOLVE_RESIDUAL settlement price (number)
  //   orderId           PERP_ORDER_RESERVE / RELEASE pending-order id (nanoid)
  'feeBps',
  'feeBase',
  'finalPrice',
  'orderId',
]

// ---- contracts.data.answers[] (denormalized answer objects) ---------------
// Legacy DPM-era answers embedded the answerer's full display identity.
export const ANSWER_USER_ID_FIELDS = ['userId', 'resolverId', 'loverUserId']
// textFts is a search vector of the answer text ("'word':1 …"), stripped like
// the *_fts columns: noise for a licensee, and a second copy of any name the
// prose rewrite (identity.ts) replaces in the text itself.
export const ANSWER_STRIP_FIELDS = ['username', 'name', 'avatarUrl', 'textFts']
export const ANSWER_ALLOWED_FIELDS = [
  'color',
  'contractId',
  'createdTime',
  'fsUpdatedTime',
  'id',
  'imageUrl',
  'index',
  'isOther',
  'midpoint',
  'number',
  'p',
  'poolNo',
  'poolYes',
  'prob',
  'probChangeDay',
  'probChangeMonth',
  'probChangeWeek',
  'probChanges',
  'resolution',
  'resolutionProbability',
  'resolutionTime',
  'shortText',
  'subsidyPool',
  'text',
  'totalLiquidity',
  'totalSubsidy',
  'volume',
]

// ---- contract filter ------------------------------------------------------
// The contractual "Licensed Data" definition: public, non-deleted markets.
// backend/supabase/contracts.sql:10,53
export const CONTRACT_FILTER_SQL = `visibility = 'public' AND deleted = false`

export const CONTRACT_FILTER_DEF = {
  visibility: 'public',
  deleted: false,
  note:
    'Applied to contracts; child rows (bets, comments, answers, liquidity) are included only if they reference an in-scope contract. ' +
    'txns ship in full EXCEPT rows referencing an out-of-scope contract. bot_accounts is the pseudonymized bot-flag list (no contract association).',
}

// ---- delivered column types ----------------------------------------------
// pg numerics/timestamps arrive as strings through the NDJSON staging path, so
// without this the Parquet columns land as VARCHAR. The writer overrides the
// inferred type for these column NAMES (names are consistent across tables);
// DuckDB casts the staged strings during the COPY. A miscast value fails the
// COPY and aborts the run — loud, like every other gate.
export const COLUMN_TYPES: Record<string, string> = {
  // timestamps (stored as ISO-8601 UTC strings in staging)
  created_time: 'TIMESTAMPTZ',
  close_time: 'TIMESTAMPTZ',
  resolution_time: 'TIMESTAMPTZ',
  last_updated_time: 'TIMESTAMPTZ',
  last_bet_time: 'TIMESTAMPTZ',
  last_comment_time: 'TIMESTAMPTZ',
  updated_time: 'TIMESTAMPTZ',
  expires_at: 'TIMESTAMPTZ',
  home_page_score_adjustment_expires_at: 'TIMESTAMPTZ',
  // numerics
  amount: 'DOUBLE',
  shares: 'DOUBLE',
  prob_before: 'DOUBLE',
  prob_after: 'DOUBLE',
  loan_amount: 'DOUBLE',
  resolution_probability: 'DOUBLE',
  prob: 'DOUBLE',
  pool_yes: 'DOUBLE',
  pool_no: 'DOUBLE',
  total_liquidity: 'DOUBLE',
  subsidy_pool: 'DOUBLE',
  prob_change_day: 'DOUBLE',
  prob_change_week: 'DOUBLE',
  prob_change_month: 'DOUBLE',
  midpoint: 'DOUBLE',
  p: 'DOUBLE', // answers.p (cpmm-multi-2), added on main 2026-09-23
  volume: 'DOUBLE',
  popularity_score: 'DOUBLE',
  importance_score: 'DOUBLE',
  freshness_score: 'DOUBLE',
  conversion_score: 'DOUBLE',
  daily_score: 'DOUBLE',
  home_page_score_adjustment: 'DOUBLE',
  // integer counts
  view_count: 'BIGINT',
  unique_bettor_count: 'BIGINT',
  likes: 'BIGINT',
  dislikes: 'BIGINT',
  index: 'BIGINT',
  // derived (redact.ts); null on rows that aren't cancelled orders, so a
  // first part with no cancellations must not infer it as JSON
  cancel_time_reliable: 'BOOLEAN',
}

// ---- limit-order cancellation times ---------------------------------------
// contract_bets.updated_time is the cancellation time of a cancelled limit
// order, EXCEPT while the updated_time trigger was broken: an AFTER UPDATE
// trigger assigned NEW, which does nothing, so cancels left updated_time at
// its insert value (= created_time). Introduced 2024-05-30 (last good stamp in
// the data 2024-05-23 21:50 UTC), fixed by acca64b990 (stamping resumes
// 2025-01-29 ~01:22 UTC). An order cancelled in that window can't be told
// apart from one cancelled within a second of placement, so every cancelled
// order placed before the fix with updated ≈ created is marked unreliable.
export const CANCEL_STAMP_BROKEN_FROM = '2024-05-23T22:00:00Z'
export const CANCEL_STAMP_FIXED_AT = '2025-01-29T01:20:00Z'
// |updated_time - created_time| below this means "never restamped"
export const CANCEL_STAMP_SAME_MS = 1000
// fills are stamped in ms by the engine and updated_time by the db clock
export const FILL_AFTER_CANCEL_SLACK_MS = 1000

// ---- manifold.markets routes ----------------------------------------------
// The first path segment of a manifold.markets link is a username unless it
// is a route. common/envs/constants RESERVED_PATHS is the list usernames may
// not take; this adds the top-level web/pages entries it doesn't cover (a
// test checks the pages directory against both, so a new page fails CI).
export const MANIFOLD_PAGE_ROUTES = [
  'about',
  'activity',
  'add-funds',
  'admin',
  'ai',
  'api',
  'browse',
  'calculator',
  'calibration',
  'charity',
  'checkout',
  'comments',
  'community-guidelines',
  'communityguidelines',
  'complexsystems',
  'cowp',
  'create',
  'create-post',
  'dashboard',
  'discord-bot',
  'election',
  'embed',
  'explore',
  'feed',
  'home',
  'jobs',
  'lab',
  'leaderboards',
  'leagues',
  'link',
  'links',
  'live',
  'login',
  'mana-auction',
  'manachan',
  'me',
  'membership',
  'messages',
  'my-calibration',
  'news',
  'notifications',
  'og-test',
  'old-charity',
  'pakman',
  'payments',
  'perps',
  'post',
  'posts',
  'predictle',
  'press',
  'prize',
  'public-messages',
  'redeem',
  'referrals',
  'register-on-discord',
  'reports',
  'server-sitemap.xml',
  'shop',
  'sign-in-waiting',
  'sitemap',
  'sports',
  'stats',
  'styles',
  'todo',
  'topic',
  'tv',
  'twitch',
  'websocket-live',
  'welcomeoffer',
  'wrapped',
  'yap',
  'yc-s23',
  // web/public directories (files are skipped by rule: usernames have no dot)
  '3d-coins',
  'achievement-badges',
  'buy-mana-graphics',
  'cards',
  'complex-systems',
  'custom-components',
  'data',
  'fonts',
  'group',
  'images',
  'landing',
  'lottie',
  'market-tiers',
  'merch',
  'mp3s',
  'mtg',
  'payment-icons',
  'political-candidates',
  'politics-party',
  'sounds',
  'testimonials',
  'theoremone',
  'welcome',
]
// manifold.markets/embed/<x>/…: <x> is a username except for these
export const MANIFOLD_EMBED_ROUTES = ['grid']

// Storage prefixes whose first segment names the uploader: a username
// (web/lib/firebase/storage.ts uploadPublicImage; the retired DALL-E covers
// in backend/api/src/helpers/on-create-market.ts) or a user id
// (private-images). 'default' is the shared folder editor uploads use.
export const STORAGE_USER_PREFIXES = [
  'contract-images',
  'user-images',
  'comment-images',
  'post-images',
  'private-images',
]
export const STORAGE_SHARED_SEGMENTS = ['default']

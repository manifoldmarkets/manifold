export type Answer = {
  id: string;
  number: number;
  contractId: string;
  createdTime: number;

  userId: string;
  username: string;
  name: string;
  avatarUrl?: string;

  text: string;
};

export type Bet = {
  id: string;
  userId: string;

  // denormalized for bet lists
  userAvatarUrl?: string;
  userUsername: string;
  userName: string;

  contractId: string;
  createdTime: number;

  amount: number; // bet size; negative if SELL bet
  loanAmount?: number;
  outcome: string;
  shares: number; // dynamic parimutuel pool weight or fixed ; negative if SELL bet

  probBefore: number;
  probAfter: number;

  fees: Fees;

  isAnte?: boolean;
  isLiquidityProvision?: boolean;
  isRedemption?: boolean;
  challengeSlug?: string;

  // Props for bets in DPM contract below.
  // A bet is either a BUY or a SELL that sells all of a previous buy.
  isSold?: boolean; // true if this BUY bet has been sold
  // This field marks a SELL bet.
  sale?: {
    amount: number; // amount user makes from sale
    betId: string; // id of BUY bet being sold
  };
} & Partial<LimitProps>;

type LimitProps = {
  orderAmount: number; // Amount of limit order.
  limitProb: number; // [0, 1]. Bet to this probability.
  isFilled: boolean; // Whether all of the bet amount has been filled.
  isCancelled: boolean; // Whether to prevent any further fills.
  // A record of each transaction that partially (or fully) fills the orderAmount.
  // I.e. A limit order could be filled by partially matching with several bets.
  // Non-limit orders can also be filled by matching with multiple limit orders.
  fills: fill[];
};

export type fill = {
  // The id the bet matched against, or null if the bet was matched by the pool.
  matchedBetId: string | null;
  amount: number;
  shares: number;
  timestamp: number;
  // If the fill is a sale, it means the matching bet has shares of the same outcome.
  // I.e. -fill.shares === matchedBet.shares
  isSale?: boolean;
};

export type Fees = {
  creatorFee: number;
  platformFee: number;
  liquidityFee: number;
};

export type Group = {
  id: string;
  slug: string;
  name: string;
  about: string;
  creatorId: string; // User id
  createdTime: number;
  anyoneCanJoin: boolean;
  totalContracts: number;
  totalMembers: number;
  aboutPostId?: string;
  postIds: string[];
  chatDisabled?: boolean;
  mostRecentContractAddedTime?: number;
  cachedLeaderboard?: {
    topTraders: {
      userId: string;
      score: number;
    }[];
    topCreators: {
      userId: string;
      score: number;
    }[];
  };
  pinnedItems: { itemId: string; type: 'post' | 'contract' }[];
};

export type AnyMechanism = DPM | CPMM;
export type AnyOutcomeType = Binary | MultipleChoice | PseudoNumeric | FreeResponse | Numeric;
export type AnyContractType = (CPMM & Binary) | (CPMM & PseudoNumeric) | (DPM & Binary) | (DPM & FreeResponse) | (DPM & Numeric) | (DPM & MultipleChoice);

export type Contract<T extends AnyContractType = AnyContractType> = {
  id: string;
  slug: string; // auto-generated; must be unique

  creatorId: string;
  creatorName: string;
  creatorUsername: string;
  creatorAvatarUrl?: string;

  question: string;
  description: any; // More info about what the contract is about
  visibility: visibility;

  createdTime: number; // Milliseconds since epoch
  lastUpdatedTime: number; // Updated on new bet or comment
  lastBetTime?: number;
  lastCommentTime?: number;
  closeTime?: number; // When no more trading is allowed

  isResolved: boolean;
  resolutionTime?: number; // When the contract creator resolved the market
  resolution?: string;
  resolutionProbability?: number;

  closeEmailsSent?: number;

  volume: number;
  volume24Hours: number;
  elasticity: number;

  collectedFees: Fees;

  groupSlugs?: string[];
  groupLinks?: GroupLink[];
  uniqueBettorCount: number;
  popularityScore: number;
  dailyScore: number;
  likedByUserCount?: number;
  unlistedById?: string;
} & T;

export type BinaryContract = Contract & Binary;
export type PseudoNumericContract = Contract & PseudoNumeric;
export type NumericContract = Contract & Numeric;
export type FreeResponseContract = Contract & FreeResponse;
export type MultipleChoiceContract = Contract & MultipleChoice;
export type DPMContract = Contract & DPM;
export type CPMMContract = Contract & CPMM;
export type DPMBinaryContract = BinaryContract & DPM;
export type CPMMBinaryContract = BinaryContract & CPMM;

export type DPM = {
  mechanism: 'dpm-2';

  pool: { [outcome: string]: number };
  phantomShares?: { [outcome: string]: number };
  totalShares: { [outcome: string]: number };
  totalBets: { [outcome: string]: number };
};

export type CPMM = {
  mechanism: 'cpmm-1';
  pool: { [outcome: string]: number };
  p: number; // probability constant in y^p * n^(1-p) = k
  totalLiquidity: number; // for historical reasons, this the total subsidy amount added in M$
  subsidyPool: number; // current value of subsidy pool in M$
  prob: number;
  probChanges: {
    day: number;
    week: number;
    month: number;
  };
};

export type Binary = {
  outcomeType: 'BINARY';
  initialProbability: number;
  resolutionProbability?: number; // Used for BINARY markets resolved to MKT
  resolution?: resolution;
};

export type PseudoNumeric = {
  outcomeType: 'PSEUDO_NUMERIC';
  min: number;
  max: number;
  isLogScale: boolean;
  resolutionValue?: number;

  // same as binary market; map everything to probability
  initialProbability: number;
  resolutionProbability?: number;
};

export type FreeResponse = {
  outcomeType: 'FREE_RESPONSE';
  answers: Answer[]; // Used for outcomeType 'FREE_RESPONSE'.
  resolution?: string | 'MKT' | 'CANCEL';
  resolutions?: { [outcome: string]: number }; // Used for MKT resolution.
};

export type MultipleChoice = {
  outcomeType: 'MULTIPLE_CHOICE';
  answers: Answer[];
  resolution?: string | 'MKT' | 'CANCEL';
  resolutions?: { [outcome: string]: number }; // Used for MKT resolution.
};

export type Numeric = {
  outcomeType: 'NUMERIC';
  bucketCount: number;
  min: number;
  max: number;
  resolutions?: { [outcome: string]: number }; // Used for MKT resolution.
  resolutionValue?: number;
};

export type visibility = 'public' | 'unlisted';

export type GroupLink = {
  slug: string;
  name: string;
  groupId: string;
  createdTime: number;
  userId?: string;
};

export type resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL';

export type User = {
  id: string;
  createdTime: number;

  name: string;
  username: string;
  avatarUrl?: string;

  // For their user page
  bio?: string;
  website?: string;
  twitterHandle?: string;
  discordHandle?: string;

  balance: number;
  totalDeposits: number;

  profitCached: {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
  };

  fractionResolvedCorrectly: number;

  nextLoanCached: number;
  followerCountCached: number;

  followedCategories?: string[];
  homeSections?: string[];

  referredByUserId?: string;
  referredByContractId?: string;
  referredByGroupId?: string;
  shouldShowWelcome?: boolean;
  lastBetTime?: number;
  currentBettingStreak?: number;
  hasSeenContractFollowModal?: boolean;
  freeMarketsCreated?: number;
  isBannedFromPosting?: boolean;

  achievements: {
    provenCorrect?: {
      badges: any[];
    };
    marketCreator?: {
      badges: any[];
    };
    streaker?: {
      badges: any[];
    };
  };
};

/* Pulled from https://docs.manifold.markets/api on 19/07/2022 */

// Information about a market, but without bets or comments
export type LiteMarket = {
    // Unique identifer for this market
    id: string;

    // Attributes about the creator
    creatorUsername: string;
    creatorName: string;
    createdTime: number; // milliseconds since epoch
    creatorAvatarUrl?: string;

    // Market attributes. All times are in milliseconds since epoch
    closeTime?: number; // Min of creator's chosen date, and resolutionTime
    question: string;
    description: string;

    // A list of tags on each market. Any user can add tags to any market.
    // This list also includes the predefined categories shown as filters on the home page.
    tags: string[];

    // Note: This url always points to https://manifold.markets, regardless of what instance the api is running on.
    // This url includes the creator's username, but this doesn't need to be correct when constructing valid URLs.
    //   i.e. https://manifold.markets/Austin/test-market is the same as https://manifold.markets/foo/test-market
    url: string;

    outcomeType: string; // BINARY, FREE_RESPONSE, or NUMERIC
    mechanism: string; // dpm-2 or cpmm-1

    probability: number;
    pool: { outcome: number }; // For CPMM markets, the number of shares in the liquidity pool. For DPM markets, the amount of mana invested in each answer.
    p?: number; // CPMM markets only, probability constant in y^p * n^(1-p) = k
    totalLiquidity?: number; // CPMM markets only, the amount of mana deposited into the liquidity pool

    volume: number;
    volume7Days: number;
    volume24Hours: number;

    isResolved: boolean;
    resolutionTime?: number;
    resolution?: string;
    resolutionProbability?: number; // Used for BINARY markets resolved to MKT
};

// // A complete market, along with bets, comments, and answers (for free response markets)
export type FullMarket = LiteMarket & {
    bets: Bet[];
    // comments: Comment[]; //!!! Missing type defs for Comment and Answer - speak to Marshall
    // answers?: Answer[];
};

export type Bet = {
    id: string;
    contractId: string;

    amount: number; // bet size; negative if SELL bet
    outcome: string;
    shares: number; // dynamic parimutuel pool weight; negative if SELL bet

    probBefore: number;
    probAfter: number;

    sale?: {
        amount: number; // amount user makes from sale
        betId: string; // id of bet being sold
    };

    isSold?: boolean; // true if this BUY bet has been sold
    isAnte?: boolean;

    createdTime: number;

    //!!! Added by Phil:
    userId: string;
    isRedemption: boolean;
    fees?: {
        creatorFee: number;
        platformFee: number;
        liquidityFee: number;
    };
};

export type LiteUser = {
    id: string; // user's unique id
    createdTime: number;

    name: string; // display name, may contain spaces
    username: string; // username, used in urls
    url: string; // link to user's profile
    avatarUrl?: string;

    bio?: string;
    bannerUrl?: string;
    website?: string;
    twitterHandle?: string;
    discordHandle?: string;

    // Note: the following are here for convenience only and may be removed in the future.
    balance: number;
    totalDeposits: number;
    totalPnLCached: number;
    creatorVolumeCached: number;
};

export enum ResolutionOutcome {
    YES = "YES",
    NO = "NO",
    PROB = "MKT",
    CANCEL = "CANCEL",
}

export type Group = {
    id: string;
    slug: string;
    name: string;
    about: string;
    creatorId: string; // User id
    createdTime: number;
    mostRecentActivityTime: number;
    memberIds: string[]; // User ids
    anyoneCanJoin: boolean;
    contractIds: string[];

    chatDisabled?: boolean;
    mostRecentChatActivityTime?: number;
    mostRecentContractAddedTime?: number;
};

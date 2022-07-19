type Bet = {
    userId: string;
    orderAmount: number;

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
};

type LiteUser = {
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

export { Bet, LiteUser };

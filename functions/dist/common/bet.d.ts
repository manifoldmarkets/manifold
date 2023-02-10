import { Fees } from './fees';
export type Bet = {
    id: string;
    userId: string;
    userAvatarUrl?: string;
    userUsername: string;
    userName: string;
    contractId: string;
    createdTime: number;
    amount: number;
    loanAmount?: number;
    outcome: string;
    shares: number;
    sharesByOutcome?: {
        [outcome: string]: number;
    };
    probBefore: number;
    probAfter: number;
    fees: Fees;
    isAnte: boolean;
    isRedemption: boolean;
    isChallenge: boolean;
    challengeSlug?: string;
    isSold?: boolean;
    sale?: {
        amount: number;
        betId: string;
    };
} & Partial<LimitProps>;
export type NumericBet = Bet & {
    value: number;
    allOutcomeShares: {
        [outcome: string]: number;
    };
    allBetAmounts: {
        [outcome: string]: number;
    };
};
export type LimitBet = Bet & LimitProps;
type LimitProps = {
    orderAmount: number;
    limitProb: number;
    isFilled: boolean;
    isCancelled: boolean;
    fills: fill[];
};
export type fill = {
    matchedBetId: string | null;
    amount: number;
    shares: number;
    timestamp: number;
    isSale?: boolean;
};
export {};

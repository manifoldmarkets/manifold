import { LimitBet } from './bet';
import { Fees } from './fees';
import { LiquidityProvision } from './liquidity-provision';
export type CpmmState = {
    pool: {
        [outcome: string]: number;
    };
    p: number;
};
export declare function getCpmmProbability(pool: {
    [outcome: string]: number;
}, p: number): number;
export declare function getCpmmProbabilityAfterBetBeforeFees(state: CpmmState, outcome: string, bet: number): number;
export declare function getCpmmOutcomeProbabilityAfterBet(state: CpmmState, outcome: string, bet: number): number;
export declare function getCpmmFees(state: CpmmState, bet: number, outcome: string): {
    remainingBet: number;
    totalFees: number;
    fees: Fees;
};
export declare function calculateCpmmSharesAfterFee(state: CpmmState, bet: number, outcome: string): number;
export declare function calculateCpmmPurchase(state: CpmmState, bet: number, outcome: string): {
    shares: number;
    newPool: {
        YES: number;
        NO: number;
    };
    newP: number;
    fees: Fees;
};
export declare function calculateCpmmAmountToProb(state: CpmmState, prob: number, outcome: 'YES' | 'NO'): number;
export declare function calculateCpmmSale(state: CpmmState, shares: number, outcome: 'YES' | 'NO', unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}): {
    saleValue: number;
    cpmmState: {
        pool: {
            [outcome: string]: number;
        };
        p: number;
    };
    fees: Fees;
    makers: {
        bet: LimitBet;
        amount: number;
        shares: number;
        timestamp: number;
    }[];
    takers: {
        shares: number;
        amount: number;
        isSale: boolean;
        matchedBetId: string | null;
        timestamp: number;
    }[];
    ordersToCancel: LimitBet[];
};
export declare function getCpmmProbabilityAfterSale(state: CpmmState, shares: number, outcome: 'YES' | 'NO', unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}): number;
export declare function getCpmmLiquidity(pool: {
    [outcome: string]: number;
}, p: number): number;
export declare function addCpmmLiquidity(pool: {
    [outcome: string]: number;
}, p: number, amount: number): {
    newPool: {
        YES: number;
        NO: number;
    };
    liquidity: number;
    newP: number;
};
export declare function getCpmmLiquidityPoolWeights(liquidities: LiquidityProvision[]): {
    [x: string]: number;
};
export declare function getUserLiquidityShares(userId: string, pool: {
    [outcome: string]: number;
}, liquidities: LiquidityProvision[]): {
    [x: string]: number;
};

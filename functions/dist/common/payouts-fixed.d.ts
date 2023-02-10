import { Bet } from './bet';
import { CPMM2Contract, CPMMContract } from './contract';
import { LiquidityProvision } from './liquidity-provision';
export declare const getFixedCancelPayouts: (bets: Bet[], liquidities: LiquidityProvision[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: {
        userId: string;
        payout: number;
    }[];
    collectedFees: import("./fees").Fees;
};
export declare const getStandardFixedPayouts: (outcome: string, contract: CPMMContract | CPMM2Contract, bets: Bet[], liquidities: LiquidityProvision[]) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: {
        userId: string;
        payout: number;
    }[];
    collectedFees: import("./fees").Fees;
};
export declare const getLiquidityPoolPayouts: (contract: CPMMContract | CPMM2Contract, outcome: string, liquidities: LiquidityProvision[]) => {
    userId: string;
    payout: number;
}[];
export declare const getMktFixedPayouts: (contract: CPMMContract | CPMM2Contract, bets: Bet[], liquidities: LiquidityProvision[], resolutionProbs?: {
    [outcome: string]: number;
} | undefined, resolutionProbability?: number) => {
    payouts: {
        userId: string;
        payout: number;
    }[];
    creatorPayout: number;
    liquidityPayouts: {
        userId: string;
        payout: number;
    }[];
    collectedFees: import("./fees").Fees;
};
export declare const getLiquidityPoolProbPayouts: (contract: CPMMContract | CPMM2Contract, outcomeProbs: {
    [outcome: string]: number;
}, liquidities: LiquidityProvision[]) => {
    userId: string;
    payout: number;
}[];

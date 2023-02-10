import { Bet } from './bet';
import { Contract, CPMM2Contract, CPMMContract, DPMContract } from './contract';
import { Fees } from './fees';
import { LiquidityProvision } from './liquidity-provision';
export type Payout = {
    userId: string;
    payout: number;
};
export declare const getLoanPayouts: (bets: Bet[]) => Payout[];
export declare const groupPayoutsByUser: (payouts: Payout[]) => {
    [x: string]: number;
};
export type PayoutInfo = {
    payouts: Payout[];
    creatorPayout: number;
    liquidityPayouts: Payout[];
    collectedFees: Fees;
};
export declare const getPayouts: (outcome: string | undefined, contract: Contract, bets: Bet[], liquidities: LiquidityProvision[], resolutions?: {
    [outcome: string]: number;
} | undefined, resolutionProbability?: number) => PayoutInfo;
export declare const getFixedPayouts: (outcome: string | undefined, contract: CPMMContract | CPMM2Contract, bets: Bet[], liquidities: LiquidityProvision[], resolutions?: {
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
    collectedFees: Fees;
};
export declare const getDpmPayouts: (outcome: string | undefined, contract: DPMContract, bets: Bet[], resolutions?: {
    [outcome: string]: number;
} | undefined, resolutionProbability?: number) => PayoutInfo;

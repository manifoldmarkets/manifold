import { Bet } from './bet';
import { DPMContract, NumericContract } from './contract';
export declare function getDpmProbability(totalShares: {
    [outcome: string]: number;
}): number;
export declare function getDpmOutcomeProbability(totalShares: {
    [outcome: string]: number;
}, outcome: string): number;
export declare function getDpmOutcomeProbabilities(totalShares: {
    [outcome: string]: number;
}): {
    [x: string]: number;
};
export declare function getNumericBets(contract: NumericContract, bucket: string, betAmount: number, variance: number): [string, number][];
export declare const getMappedBucket: (value: number, contract: NumericContract) => string;
export declare const getValueFromBucket: (bucket: string, contract: NumericContract) => number;
export declare const getExpectedValue: (contract: NumericContract) => number;
export declare function getDpmOutcomeProbabilityAfterBet(totalShares: {
    [outcome: string]: number;
}, outcome: string, bet: number): number;
export declare function getDpmProbabilityAfterSale(totalShares: {
    [outcome: string]: number;
}, outcome: string, shares: number): number;
export declare function calculateDpmShares(totalShares: {
    [outcome: string]: number;
}, bet: number, betChoice: string): number;
export declare function calculateNumericDpmShares(totalShares: {
    [outcome: string]: number;
}, bets: [string, number][]): {
    shares: number[];
    totalShares: {
        [outcome: string]: number;
    };
};
export declare function calculateDpmRawShareValue(totalShares: {
    [outcome: string]: number;
}, shares: number, betChoice: string): number;
export declare function calculateDpmMoneyRatio(contract: DPMContract, bet: Bet, shareValue: number): number;
export declare function calculateDpmShareValue(contract: DPMContract, bet: Bet): number;
export declare function calculateDpmSaleAmount(contract: DPMContract, bet: Bet): number;
export declare function calculateDpmPayout(contract: DPMContract, bet: Bet, outcome: string): number;
export declare function calculateDpmCancelPayout(contract: DPMContract, bet: Bet): number;
export declare function calculateStandardDpmPayout(contract: DPMContract, bet: Bet, outcome: string): number;
export declare function calculateDpmPayoutAfterCorrectBet(contract: DPMContract, bet: Bet): number;
export declare function resolvedDpmPayout(contract: DPMContract, bet: Bet): number;
export declare const deductDpmFees: (betAmount: number, winnings: number) => number;
export declare const calcDpmInitialPool: (initialProbInt: number, ante: number, phantomAnte: number) => {
    sharesYes: number;
    sharesNo: number;
    poolYes: number;
    poolNo: number;
    phantomYes: number;
    phantomNo: number;
};

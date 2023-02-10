import { Bet } from './bet';
import { Contract, BinaryContract, FreeResponseContract, PseudoNumericContract, MultipleChoiceContract } from './contract';
import { ContractMetric } from 'common/contract-metric';
export declare function getProbability(contract: BinaryContract | PseudoNumericContract): number;
export declare function getInitialProbability(contract: BinaryContract | PseudoNumericContract): number;
export declare function getOutcomeProbability(contract: Contract, outcome: string): number;
export declare function getOutcomeProbabilityAfterBet(contract: Contract, outcome: string, bet: number): number;
export declare function calculateSharesBought(contract: Contract, outcome: string, amount: number): number;
export declare function calculatePayout(contract: Contract, bet: Bet, outcome: string): number;
export declare function resolvedPayout(contract: Contract, bet: Bet): number;
export declare function getContractBetMetrics(contract: Contract, yourBets: Bet[]): {
    invested: number;
    loan: number;
    payout: number;
    profit: number;
    profitPercent: number;
    totalShares: {
        [outcome: string]: number;
    };
    hasShares: boolean;
    hasYesShares: boolean;
    hasNoShares: boolean;
    maxSharesOutcome: string | null | undefined;
    lastBetTime: number;
};
export declare function getContractBetNullMetrics(): ContractMetric;
export declare function getTopAnswer(contract: FreeResponseContract | MultipleChoiceContract): import("./answer").Answer | undefined;
export declare function getTopNSortedAnswers(contract: FreeResponseContract | MultipleChoiceContract, n: number): import("./answer").Answer[];
export declare function getLargestPosition(contract: Contract, userBets: Bet[]): {
    outcome: string;
    shares: number;
} | null;

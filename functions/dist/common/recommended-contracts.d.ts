import { Bet } from './bet';
import { Contract } from './contract';
import { ClickEvent } from './tracking';
export declare const MAX_FEED_CONTRACTS = 75;
export declare const getRecommendedContracts: (contractsById: {
    [contractId: string]: Contract<import("./contract").AnyContractType>;
}, yourBetOnContractIds: string[]) => Contract<import("./contract").AnyContractType>[];
export declare const getWordScores: (contracts: Contract[], contractViewCounts: {
    [contractId: string]: number;
}, clicks: ClickEvent[], bets: Bet[]) => {
    [x: string]: number;
};
export declare function getContractScore(contract: Contract, wordScores: {
    [word: string]: number;
}): number;

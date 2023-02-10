import { Dictionary } from 'lodash';
import { Bet, LimitBet } from './bet';
import { Contract, CPMM2Contract, CPMMContract, DPMContract } from './contract';
import { PortfolioMetrics, User } from './user';
import { ContractMetric } from 'common/contract-metric';
export declare const computeInvestmentValueCustomProb: (bets: Bet[], contract: Contract, p: number) => number;
export declare const ELASTICITY_BET_AMOUNT = 100;
export declare const computeElasticity: (unfilledBets: LimitBet[], contract: Contract, betAmount?: number) => number;
export declare const computeBinaryCpmmElasticity: (unfilledBets: LimitBet[], contract: CPMMContract, betAmount: number) => number;
export declare const computeBinaryCpmmElasticityFromAnte: (ante: number, betAmount?: number) => number;
export declare const computeCPMM2Elasticity: (contract: CPMM2Contract, betAmount: number) => number;
export declare const computeDpmElasticity: (contract: DPMContract, betAmount: number) => number;
export declare const calculateCreatorTraders: (userContracts: Contract[]) => {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
};
export declare const calculateNewPortfolioMetrics: (user: User, contractsById: {
    [k: string]: Contract<import("./contract").AnyContractType>;
}, unresolvedBets: Bet[]) => {
    investmentValue: number;
    balance: number;
    totalDeposits: number;
    timestamp: number;
    userId: string;
};
export declare const calculatePortfolioProfit: (portfolio: PortfolioMetrics) => number;
export declare const calculateNewProfit: (portfolioHistory: Record<'current' | 'day' | 'week' | 'month', PortfolioMetrics | undefined>, newPortfolio: PortfolioMetrics) => {
    daily: number;
    weekly: number;
    monthly: number;
    allTime: number;
};
export declare const calculateMetricsByContract: (betsByContractId: Dictionary<Bet[]>, contractsById: Dictionary<Contract>, user?: User) => ContractMetric[];
export declare const calculateUserMetrics: (contract: Contract, bets: Bet[], user?: User) => ContractMetric;
export type ContractMetrics = ReturnType<typeof calculateMetricsByContract>[number];

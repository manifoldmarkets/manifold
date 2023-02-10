import { Bet } from './bet';
import { CPMM2Contract, CPMMContract } from './contract';
export declare function calculateFixedPayout(contract: CPMMContract | CPMM2Contract, bet: Bet, outcome: string): number;
export declare function calculateFixedCancelPayout(bet: Bet): number;
export declare function calculateStandardFixedPayout(bet: Bet, outcome: string): number;

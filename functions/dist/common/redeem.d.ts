import { Bet } from './bet';
import { CPMM2Contract, CPMMContract } from './contract';
import { CandidateBet } from './new-bet';
type RedeemableBet = Pick<Bet, 'outcome' | 'shares' | 'sharesByOutcome' | 'loanAmount'>;
export declare const getRedeemableAmount: (contract: CPMMContract | CPMM2Contract, bets: RedeemableBet[]) => {
    shares: number;
    loanPayment: number;
    netAmount: number;
};
export declare const getRedemptionBets: (contractId: string, shares: number, loanPayment: number, prob: number) => CandidateBet<Bet>[];
export declare const getRedemptionBetMulti: (contractId: string, shares: number, loanPayment: number, probsByOutcome: Record<string, number>) => CandidateBet<Bet>;
export {};

import { Bet, fill, LimitBet, NumericBet } from './bet';
import { CpmmState } from './calculate-cpmm';
import { CPMMBinaryContract, CPMMMultipleChoiceContract, DPMBinaryContract, DPMContract, NumericContract, PseudoNumericContract } from './contract';
export type CandidateBet<T extends Bet = Bet> = Omit<T, 'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'>;
export type BetInfo = {
    newBet: CandidateBet;
    newPool?: {
        [outcome: string]: number;
    };
    newTotalShares?: {
        [outcome: string]: number;
    };
    newTotalBets?: {
        [outcome: string]: number;
    };
    newTotalLiquidity?: number;
    newP?: number;
};
export declare const computeFills: (outcome: 'YES' | 'NO', betAmount: number, state: CpmmState, limitProb: number | undefined, unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}) => {
    takers: fill[];
    makers: {
        bet: LimitBet;
        amount: number;
        shares: number;
        timestamp: number;
    }[];
    totalFees: import("./fees").Fees;
    cpmmState: {
        pool: {
            [outcome: string]: number;
        };
        p: number;
    };
    ordersToCancel: LimitBet[];
};
export declare const getBinaryCpmmBetInfo: (outcome: 'YES' | 'NO', betAmount: number, contract: CPMMBinaryContract | PseudoNumericContract, limitProb: number | undefined, unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}) => {
    newBet: CandidateBet<Bet>;
    newPool: {
        [outcome: string]: number;
    };
    newP: number;
    newTotalLiquidity: number;
    makers: {
        bet: LimitBet;
        amount: number;
        shares: number;
        timestamp: number;
    }[];
    ordersToCancel: LimitBet[];
};
export declare const getBinaryBetStats: (outcome: 'YES' | 'NO', betAmount: number, contract: CPMMBinaryContract | PseudoNumericContract, limitProb: number, unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}) => {
    currentPayout: number;
    currentReturn: number;
    totalFees: number;
    newBet: CandidateBet<Bet>;
};
export declare const getNewBinaryDpmBetInfo: (outcome: 'YES' | 'NO', amount: number, contract: DPMBinaryContract) => {
    newBet: CandidateBet<Bet>;
    newPool: {
        YES: number;
        NO: number;
    };
    newTotalShares: {
        YES: number;
        NO: number;
    };
    newTotalBets: {
        YES: number;
        NO: number;
    };
};
export declare const getNewMultiBetInfo: (outcome: string, amount: number, contract: DPMContract) => {
    newBet: CandidateBet<Bet>;
    newPool: {
        [x: string]: number;
    };
    newTotalShares: {
        [x: string]: number;
    };
    newTotalBets: {
        [x: string]: number;
    };
};
export declare const getNewMultiCpmmBetInfo: (contract: CPMMMultipleChoiceContract, outcome: string, amount: number, shouldShortSell: boolean) => {
    newBet: CandidateBet<Bet>;
    newPool: {
        [outcome: string]: number;
    };
};
export declare const getNumericBetsInfo: (value: number, outcome: string, amount: number, contract: NumericContract) => {
    newBet: CandidateBet<NumericBet>;
    newPool: {
        [k: string]: number;
    };
    newTotalShares: {
        [outcome: string]: number;
    };
    newTotalBets: {
        [k: string]: number;
    };
};

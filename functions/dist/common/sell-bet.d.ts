import { Bet, LimitBet } from './bet';
import { CPMMContract, DPMContract } from './contract';
import { Fees } from './fees';
export type CandidateBet<T extends Bet> = Omit<T, 'id' | 'userId' | 'userAvatarUrl' | 'userName' | 'userUsername'>;
export declare const getSellBetInfo: (bet: Bet, contract: DPMContract) => {
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
    fees: Fees;
};
export declare const getCpmmSellBetInfo: (shares: number, outcome: 'YES' | 'NO', contract: CPMMContract, unfilledBets: LimitBet[], balanceByUserId: {
    [userId: string]: number;
}, loanPaid: number) => {
    newBet: CandidateBet<Bet>;
    newPool: {
        [outcome: string]: number;
    };
    newP: number;
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

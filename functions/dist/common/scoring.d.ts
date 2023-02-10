import { Bet } from './bet';
import { Contract } from './contract';
import { ContractComment } from './comment';
export declare function scoreCommentorsAndBettors(contract: Contract, bets: Bet[], comments: ContractComment[]): {
    topCommentId: string;
    topBetId: string;
    topBettor: string;
    profitById: Record<string, number>;
    commentsById: import("lodash").Dictionary<ContractComment>;
    betsById: import("lodash").Dictionary<Bet>;
    topCommentBetId: string | undefined;
};

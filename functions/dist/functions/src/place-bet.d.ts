import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { LimitBet } from '../../common/bet';
export declare const placebet: import("./api").EndpointDefinition;
export declare const getUnfilledBetsAndUserBalances: (trans: Transaction, contractDoc: DocumentReference, bettorId: string) => Promise<{
    unfilledBets: LimitBet[];
    balanceByUserId: {
        [k: string]: number;
    };
}>;
type maker = {
    bet: LimitBet;
    amount: number;
    shares: number;
    timestamp: number;
};
export declare const updateMakers: (makers: maker[], takerBetId: string, contractDoc: DocumentReference, trans: Transaction) => void;
export {};

import * as admin from 'firebase-admin';
export declare function mintAndPoolCert(userId: string, certId: string, mintShares: number, poolShares: number): Promise<admin.firestore.WriteResult[]>;
export declare function buyFromPool(userId: string, certId: string, shares: number, mana: number, transaction: admin.firestore.Transaction): void;
export declare function dividendTxns(transaction: admin.firestore.Transaction, providerId: string, certId: string, payouts: {
    userId: string;
    payout: number;
}[]): void;

import { CertTxn } from 'common/txn';
export declare function getCertOwnership(txns: CertTxn[]): {
    [id: string]: number;
};
export declare function getCertOwnershipUsers(creatorId: string, txns: CertTxn[]): {
    [userId: string]: number;
};
export declare function getDividendPayouts(providerId: string, totalDividend: number, txns: CertTxn[]): {
    userId: string;
    payout: number;
}[];
export declare function toPayoutsMap(payouts: {
    userId: string;
    payout: number;
}[]): {
    [k: string]: number;
};
export declare function getCertPoints(txns: CertTxn[]): {
    x: number;
    y: number;
}[];

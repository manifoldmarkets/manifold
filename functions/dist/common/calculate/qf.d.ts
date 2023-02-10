import { QfTxn } from 'common/txn';
export declare function calculateMatches(txns: QfTxn[], matchingPool: number): Record<string, number>;
export declare function calculateTotals(txns: QfTxn[]): {
    [x: string]: number;
};
export declare function totalPaid(txns: QfTxn[]): number;

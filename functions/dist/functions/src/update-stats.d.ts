import * as functions from 'firebase-functions';
interface StatEvent {
    id: string;
    userId: string;
    ts: number;
}
export declare function getDailyBets(startTime: number, numberOfDays: number): Promise<{
    id: string;
    userId: any;
    ts: any;
    amount: any;
}[][]>;
export declare function getDailyComments(startTime: number, numberOfDays: number): Promise<StatEvent[][]>;
export declare function getDailyContracts(startTime: number, numberOfDays: number): Promise<StatEvent[][]>;
export declare function getStripeSales(startTime: number, numberOfDays: number): Promise<any[][]>;
export declare function getDailyNewUsers(startTime: number, numberOfDays: number): Promise<StatEvent[][]>;
export declare const updateStatsCore: () => Promise<void>;
export declare const updateStats: functions.CloudFunction<unknown>;
export {};

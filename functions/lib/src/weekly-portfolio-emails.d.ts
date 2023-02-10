import * as functions from 'firebase-functions';
export declare const weeklyPortfolioUpdateEmails: functions.CloudFunction<unknown>;
export declare function sendPortfolioUpdateEmailsToAllUsers(): Promise<void>;
export type PerContractInvestmentsData = {
    questionTitle: string;
    questionUrl: string;
    questionProb: string;
    profitStyle: string;
    currentValue: number;
    pastValue: number;
    profit: number;
};
export type OverallPerformanceData = {
    profit: string;
    prediction_streak: string;
    markets_traded: string;
    profit_style: string;
    likes_received: string;
    markets_created: string;
    unique_bettors: string;
};

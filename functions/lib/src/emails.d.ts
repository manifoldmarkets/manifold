/// <reference types="mailgun-js" />
import { Bet } from '../../common/bet';
import { Contract } from '../../common/contract';
import { PrivateUser, User } from '../../common/user';
import { notification_reason_types } from '../../common/notification';
import { Dictionary } from 'lodash';
import { PerContractInvestmentsData, OverallPerformanceData } from './weekly-portfolio-emails';
export declare const emailMoneyFormat: (amount: number) => string;
export declare const sendMarketResolutionEmail: (reason: notification_reason_types, privateUser: PrivateUser, investment: number, payout: number, creator: User, creatorPayout: number, contract: Contract, resolution: string, resolutionProbability?: number, resolutions?: {
    [outcome: string]: number;
} | undefined) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendWelcomeEmail: (user: User, privateUser: PrivateUser) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendPersonalFollowupEmail: (user: User, privateUser: PrivateUser, sendTime: string) => Promise<void>;
export declare const sendCreatorGuideEmail: (user: User, privateUser: PrivateUser, sendTime: string) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendThankYouEmail: (user: User, privateUser: PrivateUser) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendMarketCloseEmail: (reason: notification_reason_types, user: User, privateUser: PrivateUser, contract: Contract) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendNewCommentEmail: (reason: notification_reason_types, privateUser: PrivateUser, commentCreator: User, contract: Contract, commentText: string, commentId: string, bet?: Bet, answerText?: string, answerId?: string) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendNewAnswerEmail: (reason: notification_reason_types, privateUser: PrivateUser, name: string, text: string, contract: Contract, avatarUrl?: string) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendInterestingMarketsEmail: (user: User, privateUser: PrivateUser, contractsToSend: Contract[], deliveryTime?: string) => Promise<void>;
export declare const sendNewFollowedMarketEmail: (reason: notification_reason_types, userId: string, privateUser: PrivateUser, contract: Contract) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendNewUniqueBettorsEmail: (reason: notification_reason_types, userId: string, privateUser: PrivateUser, contract: Contract, totalPredictors: number, newPredictors: User[], userBets: Dictionary<[Bet, ...Bet[]]>, bonusAmount: number) => Promise<import("mailgun-js").messages.SendResponse | null | undefined>;
export declare const sendWeeklyPortfolioUpdateEmail: (user: User, privateUser: PrivateUser, investments: PerContractInvestmentsData[], overallPerformance: OverallPerformanceData, moversToSend: number) => Promise<void>;

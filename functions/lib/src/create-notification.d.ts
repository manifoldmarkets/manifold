import * as admin from 'firebase-admin';
import { PrivateUser, User } from '../../common/user';
import { Contract } from '../../common/contract';
import { Bet, LimitBet } from '../../common/bet';
import { TipTxn } from '../../common/txn';
import { Group } from '../../common/group';
import { Challenge } from '../../common/challenge';
import { Reaction } from 'common/reaction';
import { GroupMember } from 'common/group-member';
export declare const createFollowOrMarketSubsidizedNotification: (sourceId: string, sourceType: 'liquidity' | 'follow', sourceUpdateType: 'created', sourceUser: User, idempotencyKey: string, sourceText: string, miscData?: {
    contract?: Contract;
    recipients?: string[];
}) => Promise<void>;
export type replied_users_info = {
    [key: string]: {
        repliedToType: 'comment' | 'answer';
        repliedToAnswerText: string | undefined;
        repliedToId: string | undefined;
        bet: Bet | undefined;
    };
};
export declare const createCommentOrAnswerOrUpdatedContractNotification: (sourceId: string, sourceType: 'comment' | 'answer' | 'contract', sourceUpdateType: 'created' | 'updated', sourceUser: User, idempotencyKey: string, sourceText: string, sourceContract: Contract, miscData?: {
    repliedUsersInfo: replied_users_info;
    taggedUserIds: string[];
}) => Promise<void>;
export declare const createTipNotification: (fromUser: User, toUser: User, tip: TipTxn, idempotencyKey: string, commentId: string, contract?: Contract, group?: Group) => Promise<admin.firestore.WriteResult | undefined>;
export declare const createBetFillNotification: (fromUser: User, toUser: User, bet: Bet, limitBet: LimitBet, contract: Contract, idempotencyKey: string) => Promise<admin.firestore.WriteResult | undefined>;
export declare const createReferralNotification: (toUser: User, referredUser: User, idempotencyKey: string, bonusAmount: string, referredByContract?: Contract, referredByGroup?: Group) => Promise<void>;
export declare const createLoanIncomeNotification: (toUser: User, idempotencyKey: string, income: number) => Promise<void>;
export declare const createChallengeAcceptedNotification: (challenger: User, challengeCreator: User, challenge: Challenge, acceptedAmount: number, contract: Contract) => Promise<admin.firestore.WriteResult | undefined>;
export declare const createBettingStreakBonusNotification: (user: User, txnId: string, bet: Bet, contract: Contract, amount: number, streak: number, idempotencyKey: string) => Promise<admin.firestore.WriteResult | undefined>;
export declare const createLikeNotification: (reaction: Reaction) => Promise<admin.firestore.WriteResult | undefined>;
export declare const createUniqueBettorBonusNotification: (contractCreatorId: string, bettor: User, txnId: string, contract: Contract, amount: number, uniqueBettorIds: string[], idempotencyKey: string) => Promise<void>;
export declare const createNewContractNotification: (contractCreator: User, contract: Contract, idempotencyKey: string, text: string, mentionedUserIds: string[]) => Promise<void>;
export declare const createContractResolvedNotifications: (contract: Contract, creator: User, outcome: string, probabilityInt: number | undefined, resolutionValue: number | undefined, resolutionData: {
    bets: Bet[];
    userInvestments: {
        [userId: string]: number;
    };
    userPayouts: {
        [userId: string]: number;
    };
    creator: User;
    creatorPayout: number;
    contract: Contract;
    outcome: string;
    resolutionProbability?: number | undefined;
    resolutions?: {
        [outcome: string]: number;
    } | undefined;
}) => Promise<void>;
export declare const createMarketClosedNotification: (contract: Contract, creator: User, privateUser: PrivateUser, idempotencyKey: string) => Promise<void>;
export declare const createGroupStatusChangeNotification: (initiator: User, affectedMember: GroupMember, group: Group, newStatus: string) => Promise<admin.firestore.WriteResult | undefined>;

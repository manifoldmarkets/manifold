import { notification_preference } from './user-notification-preferences';
import { outcomeType } from 'common/contract';
export type Notification = {
    id: string;
    userId: string;
    reasonText?: string;
    reason: notification_reason_types | notification_preference;
    createdTime: number;
    viewTime?: number;
    isSeen: boolean;
    sourceId: string;
    sourceType: notification_source_types;
    sourceUpdateType?: notification_source_update_types;
    sourceContractId?: string;
    sourceUserName: string;
    sourceUserUsername: string;
    sourceUserAvatarUrl: string;
    sourceText: string;
    data?: {
        [key: string]: any;
    };
    sourceContractTitle?: string;
    sourceContractCreatorUsername?: string;
    sourceContractSlug?: string;
    sourceSlug?: string;
    sourceTitle?: string;
    isSeenOnHref?: string;
};
export type notification_source_types = 'contract' | 'comment' | 'bet' | 'answer' | 'liquidity' | 'follow' | 'tip' | 'admin_message' | 'group' | 'user' | 'bonus' | 'challenge' | 'betting_streak_bonus' | 'loan' | 'tip_and_like' | 'badge' | 'signup_bonus' | 'comment_like' | 'contract_like';
export type notification_source_update_types = 'created' | 'updated' | 'resolved' | 'deleted' | 'closed';
export type notification_reason_types = 'tagged_user' | 'on_new_follow' | 'contract_from_followed_user' | 'you_referred_user' | 'user_joined_to_bet_on_your_market' | 'unique_bettors_on_your_contract' | 'tip_received' | 'bet_fill' | 'user_joined_from_your_group_invite' | 'challenge_accepted' | 'betting_streak_incremented' | 'loan_income' | 'liked_and_tipped_your_contract' | 'comment_on_your_contract' | 'answer_on_your_contract' | 'comment_on_contract_you_follow' | 'answer_on_contract_you_follow' | 'update_on_contract_you_follow' | 'resolution_on_contract_you_follow' | 'comment_on_contract_with_users_shares_in' | 'answer_on_contract_with_users_shares_in' | 'update_on_contract_with_users_shares_in' | 'resolution_on_contract_with_users_shares_in' | 'comment_on_contract_with_users_answer' | 'update_on_contract_with_users_answer' | 'resolution_on_contract_with_users_answer' | 'answer_on_contract_with_users_answer' | 'comment_on_contract_with_users_comment' | 'answer_on_contract_with_users_comment' | 'update_on_contract_with_users_comment' | 'resolution_on_contract_with_users_comment' | 'reply_to_users_answer' | 'reply_to_users_comment' | 'your_contract_closed' | 'subsidized_your_market' | 'group_role_changed';
type notification_descriptions = {
    [key in notification_preference]: {
        simple: string;
        detailed: string;
        necessary?: boolean;
        verb?: string;
    };
};
export declare const NOTIFICATION_DESCRIPTIONS: notification_descriptions;
export type BettingStreakData = {
    streak: number;
    bonusAmount: number;
};
export type BetFillData = {
    betOutcome: string;
    creatorOutcome: string;
    probability: number;
    fillAmount: number;
    limitOrderTotal?: number;
    limitOrderRemaining?: number;
    limitAt?: string;
    outcomeType?: outcomeType;
};
export type ContractResolutionData = {
    outcome: string;
    userPayout: number;
    userInvestment: number;
};
export declare function getSourceIdForLinkComponent(sourceId: string, sourceType?: notification_source_types): string;
export declare function getSourceUrl(notification: Notification): string;
export declare const ReactionNotificationTypes: Partial<notification_source_types>[];
export {};

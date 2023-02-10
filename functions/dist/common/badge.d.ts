import { User } from './user';
export type Badge = {
    type: BadgeTypes;
    createdTime: number;
    data: {
        [key: string]: any;
    };
    name: 'Proven Correct' | 'Streaker' | 'Market Creator';
};
export type BadgeTypes = 'PROVEN_CORRECT' | 'STREAKER' | 'MARKET_CREATOR';
export type ProvenCorrectBadgeData = {
    type: 'PROVEN_CORRECT';
    data: {
        contractSlug: string;
        contractCreatorUsername: string;
        contractTitle: string;
        commentId: string;
        betAmount: number;
        profit?: number;
    };
};
export type MarketCreatorBadgeData = {
    type: 'MARKET_CREATOR';
    data: {
        totalContractsCreated: number;
    };
};
export type StreakerBadgeData = {
    type: 'STREAKER';
    data: {
        totalBettingStreak: number;
    };
};
export type ProvenCorrectBadge = Badge & ProvenCorrectBadgeData;
export type StreakerBadge = Badge & StreakerBadgeData;
export type MarketCreatorBadge = Badge & MarketCreatorBadgeData;
export declare const MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE = 5;
export declare const provenCorrectRarityThresholds: number[];
export declare const streakerBadgeRarityThresholds: number[];
export declare const marketCreatorBadgeRarityThresholds: number[];
export type rarities = 'bronze' | 'silver' | 'gold';
export declare const calculateBadgeRarity: (badge: Badge) => rarities;
export declare const getBadgesByRarity: (user: User | null | undefined) => {
    bronze: number;
    silver: number;
    gold: number;
};
export declare const hasNoBadgeWithCurrentOrGreaterPropertyNumber: (badges: Badge[] | undefined, property: string, currentNumber: number) => boolean;

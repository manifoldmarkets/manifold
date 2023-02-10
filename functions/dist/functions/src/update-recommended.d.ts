import * as functions from 'firebase-functions';
export declare const scheduleUpdateRecommended: functions.CloudFunction<unknown>;
export declare const updaterecommended: import("./api").EndpointDefinition;
export declare const updateRecommendedMarkets: () => Promise<void>;
export declare const loadUserDataForRecommendations: () => Promise<{
    userId: string;
    betOnIds: string[];
    swipedIds: string[];
    viewedCardIds: string[];
    viewedPageIds: string[];
    likedIds: string[];
    groupIds: string[];
}[]>;

export type user_data = {
    userId: string;
    betOnIds: string[];
    swipedIds: string[];
    viewedCardIds: string[];
    viewedPageIds: string[];
    likedIds: string[];
    groupIds: string[];
};
export declare function getMarketRecommendations(userData: user_data[], iterations?: number): {
    userIds: string[];
    userFeatures: number[][];
    contractIds: string[];
    contractFeatures: number[][];
    getUserContractScores: (userId: string) => {
        [k: string]: number;
    };
};

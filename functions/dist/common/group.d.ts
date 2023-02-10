export type Group = {
    id: string;
    slug: string;
    name: string;
    about: string;
    creatorId: string;
    createdTime: number;
    mostRecentActivityTime: number;
    anyoneCanJoin: boolean;
    totalContracts: number;
    totalMembers: number;
    aboutPostId?: string;
    postIds: string[];
    mostRecentContractAddedTime?: number;
    cachedLeaderboard?: {
        topTraders: {
            userId: string;
            score: number;
        }[];
        topCreators: {
            userId: string;
            score: number;
        }[];
    };
    pinnedItems: {
        itemId: string;
        type: 'post' | 'contract';
    }[];
    bannerUrl?: string;
};
export declare const MAX_GROUP_NAME_LENGTH = 75;
export declare const MAX_ABOUT_LENGTH = 140;
export declare const MAX_ID_LENGTH = 60;
export declare const NEW_USER_GROUP_SLUGS: string[];
export declare const GROUP_CHAT_SLUG = "chat";
export type GroupLink = {
    slug: string;
    name: string;
    groupId: string;
    createdTime: number;
    userId?: string;
};
export type GroupContractDoc = {
    contractId: string;
    createdTime: number;
};
export type GroupMemberDoc = {
    userId: string;
    createdTime: number;
};
export declare function filterTopGroups(groups: Group[], n?: number, excludeGroups?: boolean): Group[];
export declare function groupPath(groupSlug: string, subpath?: 'edit' | 'markets' | 'about' | typeof GROUP_CHAT_SLUG | 'leaderboards' | 'posts'): string;

export type Reaction = {
    id: string;
    contentId: string;
    contentParentId: string;
    contentType: ReactionContentTypes;
    type: ReactionTypes;
    createdTime: number;
    userId: string;
    userUsername: string;
    userAvatarUrl: string;
    userDisplayName: string;
    contentOwnerId: string;
    slug: string;
    title: string;
    text: string;
    data?: {
        [key: string]: any;
    };
};
export type ReactionContentTypes = 'contract' | 'comment';
export type ReactionTypes = 'like';

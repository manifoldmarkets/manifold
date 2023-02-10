import type { JSONContent } from '@tiptap/core';
export type AnyCommentType = OnContract | OnGroup | OnPost;
export type Comment<T extends AnyCommentType = AnyCommentType> = {
    id: string;
    replyToCommentId?: string;
    userId: string;
    /** @deprecated - content now stored as JSON in content*/
    text?: string;
    content: JSONContent;
    createdTime: number;
    userName: string;
    userUsername: string;
    userAvatarUrl?: string;
    likes?: number;
} & T;
export type OnContract = {
    commentType: 'contract';
    contractId: string;
    answerOutcome?: string;
    betId?: string;
    contractSlug: string;
    contractQuestion: string;
    betAmount?: number;
    betOutcome?: string;
    commenterPositionProb?: number;
    commenterPositionShares?: number;
    commenterPositionOutcome?: string;
};
export type OnGroup = {
    commentType: 'group';
    groupId: string;
};
export type OnPost = {
    commentType: 'post';
    postId: string;
};
export type ContractComment = Comment<OnContract>;
export type GroupComment = Comment<OnGroup>;
export type PostComment = Comment<OnPost>;

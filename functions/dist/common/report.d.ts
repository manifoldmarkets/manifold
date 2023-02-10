export type Report = {
    id: string;
    userId: string;
    createdTime: number;
    contentOwnerId: string;
    contentType: ReportContentTypes;
    contentId: string;
    description?: string;
    parentId?: string;
    parentType?: 'contract' | 'post';
};
export type ReportContentTypes = 'user' | 'comment' | 'contract';

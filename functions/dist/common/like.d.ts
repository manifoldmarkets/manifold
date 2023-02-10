/** @deprecated - see reaction.ts with type === 'like' **/
export type Like = {
    id: string;
    userId: string;
    type: 'contract' | 'post';
    createdTime: number;
    tipTxnId?: string;
};
export declare const LIKE_TIP_AMOUNT = 10;
export declare const TIP_UNDO_DURATION = 2000;

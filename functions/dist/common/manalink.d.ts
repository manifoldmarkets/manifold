import { User } from './user';
export type Manalink = {
    slug: string;
    fromId: string;
    message: string;
    amount: number;
    token: 'M$';
    createdTime: number;
    expiresTime: number | null;
    maxUses: number | null;
    claimedUserIds: string[];
    claims: Claim[];
};
export type Claim = {
    toId: string;
    txnId: string;
    claimedTime: number;
};
export declare function canCreateManalink(user: User): boolean;

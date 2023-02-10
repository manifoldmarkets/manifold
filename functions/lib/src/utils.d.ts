import * as admin from 'firebase-admin';
import { CollectionReference, CollectionGroup, Query, QuerySnapshot, QueryDocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { Contract } from '../../common/contract';
import { PrivateUser, User } from '../../common/user';
import { Group } from '../../common/group';
import { Post } from '../../common/post';
export declare const log: (...args: unknown[]) => void;
export declare const logMemory: () => void;
export declare function htmlToRichText(html: string): Record<string, any>;
export declare const invokeFunction: (name: string, body?: unknown) => Promise<any>;
export declare const revalidateStaticProps: (pathToRevalidate: string) => Promise<void>;
export type UpdateSpec = {
    doc: admin.firestore.DocumentReference;
    fields: {
        [k: string]: unknown;
    };
};
export declare const writeAsync: (db: admin.firestore.Firestore, updates: UpdateSpec[], operationType?: 'update' | 'set', batchSize?: number) => Promise<void>;
export declare const loadPaginated: <T extends admin.firestore.DocumentData>(q: admin.firestore.Query<T> | admin.firestore.CollectionReference<T>, batchSize?: number) => Promise<T[]>;
export declare const processPaginated: <T extends admin.firestore.DocumentData, U>(q: admin.firestore.Query<T>, batchSize: number, fn: (ts: admin.firestore.QuerySnapshot<T>) => Promise<U>) => Promise<Awaited<U>[]>;
export declare const processPartitioned: <T extends admin.firestore.DocumentData, U>(group: admin.firestore.CollectionGroup<T>, partitions: number, fn: (ts: admin.firestore.QueryDocumentSnapshot<T>[]) => Promise<U>) => Promise<U[]>;
export declare const tryOrLogError: <T>(task: Promise<T>) => Promise<T | null>;
export declare const isProd: () => boolean;
export declare const getDoc: <T>(collection: string, doc: string) => Promise<T | undefined>;
export declare const getValue: <T>(ref: admin.firestore.DocumentReference) => Promise<T | undefined>;
export declare const getValues: <T>(query: admin.firestore.Query) => Promise<T[]>;
export declare const getContract: (contractId: string) => Promise<Contract<import("../../common/contract").AnyContractType> | undefined>;
export declare const getGroup: (groupId: string) => Promise<Group | undefined>;
export declare const getPost: (postId: string) => Promise<Post | undefined>;
export declare const getUser: (userId: string) => Promise<User | undefined>;
export declare const getPrivateUser: (userId: string) => Promise<PrivateUser | undefined>;
export declare const getAllPrivateUsers: () => Promise<PrivateUser[]>;
export declare const getAllUsers: () => Promise<User[]>;
export declare const getUserByUsername: (username: string) => Promise<User | undefined>;
export declare const payUser: (userId: string, payout: number, isDeposit?: boolean) => Promise<void>;
export declare const payUsers: (transaction: Transaction, payouts: {
    userId: string;
    payout: number;
    deposit?: number;
}[]) => void;
export declare const payUsersTransactions: (payouts: {
    userId: string;
    payout: number;
    deposit?: number;
}[], contractId: string) => Promise<void>;
export declare const getContractPath: (contract: Contract) => string;
export declare function contractUrl(contract: Contract): string;

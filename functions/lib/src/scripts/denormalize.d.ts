import { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
export type DocumentValue = {
    doc: DocumentSnapshot;
    fields: string[];
    vals: unknown[];
};
export type DocumentMapping = readonly [
    DocumentSnapshot,
    readonly DocumentSnapshot[]
];
export type DocumentDiff = {
    src: DocumentValue;
    dest: DocumentValue;
};
type PathPair = readonly [string, string];
export declare function findDiffs(docs: readonly DocumentMapping[], ...paths: PathPair[]): DocumentDiff[];
export declare function describeDiff(diff: DocumentDiff): string;
export declare function getDiffUpdate(diff: DocumentDiff): {
    doc: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
    fields: any;
};
export declare function applyDiff(transaction: Transaction, diff: DocumentDiff): void;
export {};

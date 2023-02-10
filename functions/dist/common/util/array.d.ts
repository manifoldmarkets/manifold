export declare function filterDefined<T>(array: (T | null | undefined)[]): T[];
type Falsey = false | undefined | null | 0 | '';
type FalseyValueArray<T> = T | Falsey | FalseyValueArray<T>[];
export declare function buildArray<T>(...params: FalseyValueArray<T>[]): T[];
export declare function groupConsecutive<T, U>(xs: T[], key: (x: T) => U): {
    key: U;
    items: T[];
}[];
export {};

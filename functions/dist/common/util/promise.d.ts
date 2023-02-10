export type RetryPolicy = {
    initialBackoffSec: number;
    retries: number;
};
export declare const delay: (ms: number) => Promise<void>;
export declare function withRetries<T>(q: PromiseLike<T>, policy?: RetryPolicy): Promise<T>;
export declare const mapAsync: <T, U>(items: T[], f: (item: T, index: number) => Promise<U>, maxConcurrentRequests?: number) => Promise<U[]>;

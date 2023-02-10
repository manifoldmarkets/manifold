export declare class APIError extends Error {
    code: number;
    details?: unknown;
    constructor(code: number, message: string, details?: unknown);
}
export declare function getFunctionUrl(name: string): string;

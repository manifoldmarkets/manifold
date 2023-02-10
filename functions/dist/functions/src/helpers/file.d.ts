export declare const writeJson: <T>(filename: string, obj: T) => Promise<void>;
export declare const readJson: <T>(filename: string) => Promise<T | undefined>;
export declare const writeCsv: <T extends {
    [field: string]: string;
}>(filename: string, fields: string[], data: T[]) => Promise<void>;
export declare const readCsv: <T extends {
    [field: string]: string;
}>(filename: string) => Promise<T[] | undefined>;

export declare const removeUndefinedProps: <T extends object>(obj: T) => T;
export declare const addObjects: <T extends {
    [key: string]: number;
}>(obj1: T, obj2: T) => T;
export declare const subtractObjects: <T extends {
    [key: string]: number;
}>(obj1: T, obj2: T) => T;
export declare const hasChanges: <T extends object>(obj: T, partial: Partial<T>) => boolean;

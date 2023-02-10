export declare const randomString: (length?: number) => string;
export declare function genHash(str: string): () => number;
export declare function createRNG(seed: string): () => number;
export declare const shuffle: (array: unknown[], rand: () => number) => void;
export declare function chooseRandomSubset<T>(items: T[], count: number, seed?: string): T[];

export declare const CATEGORIES_GROUP_SLUG_POSTFIX = "-default";
export declare const CATEGORIES: {
    politics: string;
    technology: string;
    science: string;
    world: string;
    sports: string;
    economics: string;
    personal: string;
    culture: string;
    manifold: string;
    covid: string;
    crypto: string;
    gaming: string;
    fun: string;
};
export type category = keyof typeof CATEGORIES;
export declare const TO_CATEGORY: {
    [k: string]: string;
};
export declare const CATEGORY_LIST: string[];
export declare const EXCLUDED_CATEGORIES: category[];
export declare const DEFAULT_CATEGORIES: string[];
export declare const DEFAULT_CATEGORY_GROUPS: {
    slug: string;
    name: string;
}[];

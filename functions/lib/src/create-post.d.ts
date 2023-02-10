import { Post } from '../../common/post';
export declare const createpost: import("./api").EndpointDefinition;
export declare const getSlug: (title: string) => Promise<string>;
export declare function getPostFromSlug(slug: string): Promise<Post | undefined>;

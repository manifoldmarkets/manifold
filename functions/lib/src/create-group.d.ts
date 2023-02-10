import { Contract } from '../../common/contract';
export declare const creategroup: import("./api").EndpointDefinition;
export declare const getSlug: (name: string) => Promise<string>;
export declare function getGroupFromSlug(slug: string): Promise<Contract<import("../../common/contract").AnyContractType> | undefined>;

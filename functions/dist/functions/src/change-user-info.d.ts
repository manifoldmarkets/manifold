import { User } from '../../common/user';
export declare const changeuserinfo: import("./api").EndpointDefinition;
export declare const changeUser: (user: User, update: {
    username?: string;
    name?: string;
    avatarUrl?: string;
}) => Promise<void>;

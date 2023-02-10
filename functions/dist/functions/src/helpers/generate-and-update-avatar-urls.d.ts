import { Bucket } from '@google-cloud/storage';
import { User } from '../../../common/user';
export declare const generateAndUpdateAvatarUrls: (users: User[]) => Promise<void>;
export declare const generateAvatarUrl: (userId: string, name: string, bucket: Bucket) => Promise<string>;

import { Notification } from '../../common/notification';
import { PrivateUser } from '../../common/user';
export declare const createPushNotification: (notification: Notification, privateUser: PrivateUser, title: string, body: string) => Promise<void>;

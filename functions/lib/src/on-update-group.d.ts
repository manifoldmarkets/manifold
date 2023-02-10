import * as functions from 'firebase-functions';
import { Group } from '../../common/group';
export declare const onUpdateGroup: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
export declare const onCreateGroupContract: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
export declare const onDeleteGroupContract: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
export declare const onCreateGroupMember: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
export declare const onDeleteGroupMember: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
export declare function removeGroupLinks(group: Group, contractIds: string[]): Promise<void>;

import * as functions from 'firebase-functions';
export declare const onCreateLike: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;
export declare const onUpdateLike: functions.CloudFunction<functions.Change<functions.firestore.QueryDocumentSnapshot>>;
export declare const onDeleteLike: functions.CloudFunction<functions.firestore.QueryDocumentSnapshot>;

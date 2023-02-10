import * as functions from 'firebase-functions';
import { FirestoreAdminClient } from '@google-cloud/firestore/types/v1/firestore_admin_client';
export declare const backupDbCore: (client: FirestoreAdminClient, project: string, bucket: string) => Promise<[import("google-gax").LROperation<import("@google-cloud/firestore/types/protos/firestore_admin_v1_proto_api").google.firestore.admin.v1.IExportDocumentsResponse, import("@google-cloud/firestore/types/protos/firestore_admin_v1_proto_api").google.firestore.admin.v1.IExportDocumentsMetadata>, import("@google-cloud/firestore/types/protos/firestore_admin_v1_proto_api").google.longrunning.IOperation | undefined, {} | undefined]>;
export declare const backupDb: functions.CloudFunction<unknown>;

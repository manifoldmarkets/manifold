"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firestore = require("@google-cloud/firestore");
const script_init_1 = require("./script-init");
const backup_db_1 = require("../backup-db");
async function backupDb() {
    const credentials = (0, script_init_1.getServiceAccountCredentials)();
    const projectId = credentials.project_id;
    const client = new firestore.v1.FirestoreAdminClient({ credentials });
    const bucket = 'manifold-firestore-backup';
    const resp = await (0, backup_db_1.backupDbCore)(client, projectId, bucket);
    console.log(`Operation: ${resp[0]['name']}`);
}
if (require.main === module) {
    backupDb().then(() => process.exit());
}
//# sourceMappingURL=backup-db.js.map
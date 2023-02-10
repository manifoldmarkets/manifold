"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const admin = require("firebase-admin");
const generate_and_update_avatar_urls_1 = require("../helpers/generate-and-update-avatar-urls");
const firestore = admin.firestore();
async function backfillAvatarUrls() {
    const userDocs = await firestore.collection('users').get();
    const users = userDocs.docs.map((doc) => doc.data());
    const usersWithNoAvatarUrl = users.filter((user) => !user.avatarUrl);
    console.log(`Found ${usersWithNoAvatarUrl.length} users with no avatarUrl.`);
    await (0, generate_and_update_avatar_urls_1.generateAndUpdateAvatarUrls)(usersWithNoAvatarUrl);
}
if (require.main === module)
    backfillAvatarUrls().then(() => process.exit());
//# sourceMappingURL=backfill-avatar-urls.js.map
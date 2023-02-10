"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markallnotifications = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const firestore_1 = require("firebase-admin/firestore");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    seen: zod_1.z.boolean(),
});
exports.markallnotifications = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { seen } = (0, api_1.validate)(bodySchema, req.body);
    const firestore = admin.firestore();
    const notifsColl = firestore
        .collection('users')
        .doc(auth.uid)
        .collection('notifications');
    const notifs = await notifsColl.where('isSeen', '==', !seen).select().get();
    const writer = firestore.bulkWriter();
    for (const doc of notifs.docs) {
        writer.update(doc.ref, {
            isSeen: seen,
            viewTime: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    await writer.close();
    return { success: true, n: notifs.size };
});
//# sourceMappingURL=mark-all-notifications.js.map
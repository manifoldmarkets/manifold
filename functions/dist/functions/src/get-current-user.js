"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getcurrentuser = void 0;
const admin = require("firebase-admin");
const api_1 = require("./api");
exports.getcurrentuser = (0, api_1.newEndpoint)({ method: 'GET' }, async (_req, auth) => {
    const userDoc = firestore.doc(`users/${auth.uid}`);
    const [userSnap] = await firestore.getAll(userDoc);
    if (!userSnap.exists)
        throw new api_1.APIError(400, 'User not found.');
    const user = userSnap.data();
    return user;
});
const firestore = admin.firestore();
//# sourceMappingURL=get-current-user.js.map
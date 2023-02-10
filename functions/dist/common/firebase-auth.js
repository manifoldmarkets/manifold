"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setFirebaseUserViaJson = void 0;
const auth_1 = require("firebase/auth");
const setFirebaseUserViaJson = async (deserializedUser, app, isNative) => {
    try {
        const clientAuth = (0, auth_1.getAuth)(app);
        const persistenceManager = clientAuth.persistenceManager;
        const persistence = persistenceManager.persistence;
        await persistence._set(persistenceManager.fullUserKey, deserializedUser);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const fbUser = (await persistenceManager.getCurrentUser());
        await (fbUser === null || fbUser === void 0 ? void 0 : fbUser.getIdToken()); // forces a refresh if necessary
        await (0, auth_1.updateCurrentUser)(clientAuth, fbUser);
        return fbUser;
    }
    catch (e) {
        if (typeof window !== 'undefined') {
            if (isNative) {
                // eslint-disable-next-line @typescript-eslint/no-extra-semi
                ;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    data: `Error setting Firebase user: ${e}`,
                }));
            }
        }
        console.error('deserializing', e);
        return null;
    }
};
exports.setFirebaseUserViaJson = setFirebaseUserViaJson;
//# sourceMappingURL=firebase-auth.js.map
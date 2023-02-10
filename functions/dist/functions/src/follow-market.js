"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeUserFromContractFollowers = exports.addUserToContractFollowers = void 0;
const admin = require("firebase-admin");
const firestore = admin.firestore();
const addUserToContractFollowers = async (contractId, userId) => {
    try {
        return await firestore
            .collection(`contracts/${contractId}/follows`)
            .doc(userId)
            .create({ id: userId, createdTime: Date.now() });
    }
    catch (e) {
        // it probably already existed, that's fine
        return;
    }
};
exports.addUserToContractFollowers = addUserToContractFollowers;
const removeUserFromContractFollowers = async (contractId, userId) => {
    return await firestore
        .collection(`contracts/${contractId}/follows`)
        .doc(userId)
        .delete();
};
exports.removeUserFromContractFollowers = removeUserFromContractFollowers;
//# sourceMappingURL=follow-market.js.map
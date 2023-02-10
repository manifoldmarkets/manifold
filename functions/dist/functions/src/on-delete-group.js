"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDeleteGroup = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore = admin.firestore();
exports.onDeleteGroup = functions.firestore
    .document('groups/{groupId}')
    .onDelete(async (change) => {
    var _a, _b;
    const group = change.data();
    // get all contracts with this group's slug
    const contracts = await firestore
        .collection('contracts')
        .where('groupSlugs', 'array-contains', group.slug)
        .get();
    console.log("contracts with group's slug:", contracts);
    for (const doc of contracts.docs) {
        const contract = doc.data();
        const newGroupLinks = (_a = contract.groupLinks) === null || _a === void 0 ? void 0 : _a.filter((link) => link.slug !== group.slug);
        // remove the group from the contract
        await firestore
            .collection('contracts')
            .doc(contract.id)
            .update({
            groupSlugs: (_b = contract.groupSlugs) === null || _b === void 0 ? void 0 : _b.filter((s) => s !== group.slug),
            groupLinks: newGroupLinks !== null && newGroupLinks !== void 0 ? newGroupLinks : [],
        });
    }
});
//# sourceMappingURL=on-delete-group.js.map
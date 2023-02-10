"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeGroupLinks = exports.onDeleteGroupMember = exports.onCreateGroupMember = exports.onDeleteGroupContract = exports.onCreateGroupContract = exports.onUpdateGroup = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const utils_1 = require("./utils");
const lodash_1 = require("lodash");
const firestore = admin.firestore();
exports.onUpdateGroup = functions.firestore
    .document('groups/{groupId}')
    .onUpdate(async (change) => {
    const prevGroup = change.before.data();
    const group = change.after.data();
    // Ignore the activity update we just made
    if (prevGroup.mostRecentActivityTime !== group.mostRecentActivityTime)
        return;
    await firestore
        .collection('groups')
        .doc(group.id)
        .update({ mostRecentActivityTime: Date.now() });
});
exports.onCreateGroupContract = functions.firestore
    .document('groups/{groupId}/groupContracts/{contractId}')
    .onCreate(async (change) => {
    var _a;
    const groupId = (_a = change.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
    if (groupId)
        await firestore
            .collection('groups')
            .doc(groupId)
            .update({
            mostRecentContractAddedTime: Date.now(),
            totalContracts: admin.firestore.FieldValue.increment(1),
        });
});
exports.onDeleteGroupContract = functions.firestore
    .document('groups/{groupId}/groupContracts/{contractId}')
    .onDelete(async (change) => {
    var _a;
    const groupId = (_a = change.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
    if (groupId)
        await firestore
            .collection('groups')
            .doc(groupId)
            .update({
            mostRecentContractAddedTime: Date.now(),
            totalContracts: admin.firestore.FieldValue.increment(-1),
        });
});
exports.onCreateGroupMember = functions.firestore
    .document('groups/{groupId}/groupMembers/{memberId}')
    .onCreate(async (change) => {
    var _a;
    const groupId = (_a = change.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
    if (groupId)
        await firestore
            .collection('groups')
            .doc(groupId)
            .update({
            mostRecentActivityTime: Date.now(),
            totalMembers: admin.firestore.FieldValue.increment(1),
        });
});
exports.onDeleteGroupMember = functions.firestore
    .document('groups/{groupId}/groupMembers/{memberId}')
    .onDelete(async (change) => {
    var _a;
    const groupId = (_a = change.ref.parent.parent) === null || _a === void 0 ? void 0 : _a.id;
    if (groupId)
        await firestore
            .collection('groups')
            .doc(groupId)
            .update({
            mostRecentActivityTime: Date.now(),
            totalMembers: admin.firestore.FieldValue.increment(-1),
        });
});
async function removeGroupLinks(group, contractIds) {
    var _a, _b, _c, _d;
    for (const contractId of contractIds) {
        const contract = await (0, utils_1.getContract)(contractId);
        await firestore
            .collection('contracts')
            .doc(contractId)
            .update({
            groupSlugs: (0, lodash_1.uniq)([
                ...((_b = (_a = contract === null || contract === void 0 ? void 0 : contract.groupSlugs) === null || _a === void 0 ? void 0 : _a.filter((slug) => slug !== group.slug)) !== null && _b !== void 0 ? _b : []),
            ]),
            groupLinks: [
                ...((_d = (_c = contract === null || contract === void 0 ? void 0 : contract.groupLinks) === null || _c === void 0 ? void 0 : _c.filter((link) => link.groupId !== group.id)) !== null && _d !== void 0 ? _d : []),
            ],
        });
    }
}
exports.removeGroupLinks = removeGroupLinks;
//# sourceMappingURL=on-update-group.js.map
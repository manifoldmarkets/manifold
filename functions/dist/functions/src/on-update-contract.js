"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onUpdateContract = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
exports.onUpdateContract = functions
    .runWith({ secrets: ['API_SECRET'] })
    .firestore.document('contracts/{contractId}')
    .onUpdate(async (change, context) => {
    const contract = change.after.data();
    const previousContract = change.before.data();
    const { eventId } = context;
    const { closeTime, question } = contract;
    if (!(0, lodash_1.isEqual)(previousContract.groupSlugs, contract.groupSlugs)) {
        await handleContractGroupUpdated(previousContract, contract);
    }
    if ((previousContract.closeTime !== closeTime ||
        previousContract.question !== question) &&
        !contract.isResolved) {
        await handleUpdatedCloseTime(previousContract, contract, eventId);
    }
    if (!(0, lodash_1.isEqual)(getPropsThatTriggerRevalidation(previousContract), getPropsThatTriggerRevalidation(contract))) {
        await revalidateContractStaticProps(contract);
    }
});
async function handleUpdatedCloseTime(previousContract, contract, eventId) {
    const contractUpdater = await (0, utils_1.getUser)(contract.creatorId);
    if (!contractUpdater)
        throw new Error('Could not find contract updater');
    let sourceText = '';
    if (previousContract.closeTime !== contract.closeTime && contract.closeTime) {
        sourceText = contract.closeTime.toString();
    }
    else if (previousContract.question !== contract.question) {
        sourceText = contract.question;
    }
    await (0, create_notification_1.createCommentOrAnswerOrUpdatedContractNotification)(contract.id, 'contract', 'updated', contractUpdater, eventId, sourceText, contract);
}
async function handleContractGroupUpdated(previousContract, contract) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const prevLength = (_b = (_a = previousContract.groupSlugs) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    const newLength = (_d = (_c = contract.groupSlugs) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0;
    if (prevLength < newLength) {
        // Contract was added to a new group
        const groupId = (_f = (_e = contract.groupLinks) === null || _e === void 0 ? void 0 : _e.find((link) => {
            var _a;
            return !((_a = previousContract.groupLinks) === null || _a === void 0 ? void 0 : _a.map((l) => l.groupId).includes(link.groupId));
        })) === null || _f === void 0 ? void 0 : _f.groupId;
        if (!groupId)
            throw new Error('Could not find new group id');
        await firestore
            .collection(`groups/${groupId}/groupContracts`)
            .doc(contract.id)
            .set({
            contractId: contract.id,
            createdTime: Date.now(),
        });
    }
    if (prevLength > newLength) {
        // Contract was removed from a group
        const groupId = (_h = (_g = previousContract.groupLinks) === null || _g === void 0 ? void 0 : _g.find((link) => { var _a; return !((_a = contract.groupLinks) === null || _a === void 0 ? void 0 : _a.some((l) => l.groupId === link.groupId)); })) === null || _h === void 0 ? void 0 : _h.groupId;
        if (!groupId)
            throw new Error('Could not find old group id');
        await firestore
            .collection(`groups/${groupId}/groupContracts`)
            .doc(contract.id)
            .delete();
    }
}
const getPropsThatTriggerRevalidation = (contract) => {
    const { volume, question, closeTime, description, groupLinks } = contract;
    return {
        volume,
        question,
        closeTime,
        description,
        groupLinks,
    };
};
async function revalidateContractStaticProps(contract) {
    await (0, utils_1.revalidateStaticProps)((0, utils_1.getContractPath)(contract));
    await (0, utils_1.revalidateStaticProps)(`/embed${(0, utils_1.getContractPath)(contract)}`);
}
const firestore = admin.firestore();
//# sourceMappingURL=on-update-contract.js.map
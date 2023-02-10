"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("functions/src/scripts/script-init");
const utils_1 = require("../utils");
const getGroups = async () => {
    const firestore = admin.firestore();
    const groups = await firestore.collection('groups').get();
    return groups.docs.map((doc) => doc.data());
};
// const createContractIdForGroup = async (
//   groupId: string,
//   contractId: string
// ) => {
//   const firestore = admin.firestore()
//   const now = Date.now()
//   const contractDoc = await firestore
//     .collection('groups')
//     .doc(groupId)
//     .collection('groupContracts')
//     .doc(contractId)
//     .get()
//   if (!contractDoc.exists)
//     await firestore
//       .collection('groups')
//       .doc(groupId)
//       .collection('groupContracts')
//       .doc(contractId)
//       .create({
//         contractId,
//         createdTime: now,
//       })
// }
// const createMemberForGroup = async (groupId: string, userId: string) => {
//   const firestore = admin.firestore()
//   const now = Date.now()
//   const memberDoc = await firestore
//     .collection('groups')
//     .doc(groupId)
//     .collection('groupMembers')
//     .doc(userId)
//     .get()
//   if (!memberDoc.exists)
//     await firestore
//       .collection('groups')
//       .doc(groupId)
//       .collection('groupMembers')
//       .doc(userId)
//       .create({
//         userId,
//         createdTime: now,
//       })
// }
// async function convertGroupFieldsToGroupDocuments() {
//   const groups = await getGroups()
//   for (const group of groups) {
//     log('updating group', group.slug)
//     const groupRef = admin.firestore().collection('groups').doc(group.id)
//     const totalMembers = (await groupRef.collection('groupMembers').get()).size
//     const totalContracts = (await groupRef.collection('groupContracts').get())
//       .size
//     if (
//       totalMembers === group.memberIds?.length &&
//       totalContracts === group.contractIds?.length
//     ) {
//       log('group already converted', group.slug)
//       continue
//     }
//     const contractStart = totalContracts - 1 < 0 ? 0 : totalContracts - 1
//     const membersStart = totalMembers - 1 < 0 ? 0 : totalMembers - 1
//     for (const contractId of group.contractIds?.slice(
//       contractStart,
//       group.contractIds?.length
//     ) ?? []) {
//       await createContractIdForGroup(group.id, contractId)
//     }
//     for (const userId of group.memberIds?.slice(
//       membersStart,
//       group.memberIds?.length
//     ) ?? []) {
//       await createMemberForGroup(group.id, userId)
//     }
//   }
// }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function updateTotalContractsAndMembers() {
    const groups = await getGroups();
    await Promise.all(groups.map(async (group) => {
        (0, utils_1.log)('updating group total contracts and members', group.slug);
        const groupRef = admin.firestore().collection('groups').doc(group.id);
        const totalMembers = (await groupRef.collection('groupMembers').get())
            .size;
        const totalContracts = (await groupRef.collection('groupContracts').get())
            .size;
        await groupRef.update({
            totalMembers,
            totalContracts,
        });
    }));
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function removeUnusedMemberAndContractFields() {
    const groups = await getGroups();
    for (const group of groups) {
        (0, utils_1.log)('removing member and contract ids', group.slug);
        const groupRef = admin.firestore().collection('groups').doc(group.id);
        await groupRef.update({
            memberIds: admin.firestore.FieldValue.delete(),
            contractIds: admin.firestore.FieldValue.delete(),
        });
    }
}
if (require.main === module) {
    (0, script_init_1.initAdmin)();
    // convertGroupFieldsToGroupDocuments()
    updateTotalContractsAndMembers();
    // removeUnusedMemberAndContractFields()
}
//# sourceMappingURL=update-groups.js.map
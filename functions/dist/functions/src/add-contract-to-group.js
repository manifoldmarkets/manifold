"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addcontracttogroup = void 0;
const constants_1 = require("../../common/envs/constants");
const admin = require("firebase-admin");
const lodash_1 = require("lodash");
const zod_1 = require("zod");
const api_1 = require("./api");
const bodySchema = zod_1.z.object({
    groupId: zod_1.z.string(),
    contractId: zod_1.z.string(),
});
exports.addcontracttogroup = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { groupId, contractId } = (0, api_1.validate)(bodySchema, req.body);
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
        var _a, _b;
        const groupMemberDoc = firestore.doc(`groups/${groupId}/groupMembers/${auth.uid}`);
        const contractDoc = firestore.doc(`contracts/${contractId}`);
        const groupDoc = firestore.doc(`groups/${groupId}`);
        const [groupMemberSnap, contractSnap, groupSnap] = await transaction.getAll(groupMemberDoc, contractDoc, groupDoc);
        let groupMember;
        if (!groupSnap.exists)
            throw new api_1.APIError(400, 'Group cannot be found');
        if (!contractSnap.exists)
            throw new api_1.APIError(400, 'Contract cannot be found');
        if (!groupMemberSnap.exists)
            groupMember = undefined;
        else {
            groupMember = groupMemberSnap.data();
        }
        const group = groupSnap.data();
        const contract = contractSnap.data();
        const firebaseUser = await admin.auth().getUser(auth.uid);
        // checks if have permission to add a contract to the group
        if (!(0, constants_1.isManifoldId)(auth.uid) && !(0, constants_1.isAdmin)(firebaseUser.email)) {
            if (!groupMember) {
                // checks if is manifold admin (therefore does not have to be a group member)
                throw new api_1.APIError(400, 'User is not a member of the group, therefore can not add any markets');
            }
            else {
                // must either be admin, moderator or owner of contract to add to group
                if (group.creatorId !== auth.uid &&
                    groupMember.role !== 'admin' &&
                    groupMember.role !== 'moderator' &&
                    contract.creatorId !== auth.uid)
                    throw new api_1.APIError(400, 'User does not have permission to add this market to group');
                if (contract.groupLinks &&
                    contract.groupLinks
                        .map((gl) => gl.groupId)
                        .some((gid) => gid === group.id))
                    throw new api_1.APIError(400, 'This market already exists in this group');
            }
        }
        const newGroupLinks = [
            ...((_a = contract.groupLinks) !== null && _a !== void 0 ? _a : []),
            {
                groupId: group.id,
                createdTime: Date.now(),
                slug: group.slug,
                userId: auth.uid,
                name: group.name,
            },
        ];
        transaction.update(contractDoc, {
            groupSlugs: (0, lodash_1.uniq)([...((_b = contract.groupSlugs) !== null && _b !== void 0 ? _b : []), group.slug]),
            groupLinks: newGroupLinks,
        });
        return contract;
    });
});
const firestore = admin.firestore();
//# sourceMappingURL=add-contract-to-group.js.map
"use strict";
// Takes a tag and makes a new group with all the contracts in it.
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const create_group_1 = require("../create-group");
const lodash_1 = require("lodash");
const getTaggedContracts = async (tag) => {
    const firestore = admin.firestore();
    const results = await firestore
        .collection('contracts')
        .where('lowercaseTags', 'array-contains', tag.toLowerCase())
        .get();
    return results.docs.map((d) => d.data());
};
const createGroup = async (name, about, contracts) => {
    var _a, _b, _c;
    const firestore = admin.firestore();
    const creatorId = (0, utils_1.isProd)()
        ? 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2'
        : '94YYTk1AFWfbWMpfYcvnnwI1veP2';
    const slug = await (0, create_group_1.getSlug)(name);
    const groupRef = firestore.collection('groups').doc();
    const now = Date.now();
    const group = {
        id: groupRef.id,
        creatorId,
        slug,
        name,
        about,
        createdTime: now,
        mostRecentActivityTime: now,
        anyoneCanJoin: true,
        totalContracts: contracts.length,
        totalMembers: 1,
        postIds: [],
        pinnedItems: [],
        bannerUrl: '/group/default_group_banner_indigo.png',
    };
    await groupRef.create(group);
    // create a GroupMemberDoc for the creator
    const memberDoc = groupRef.collection('groupMembers').doc(creatorId);
    await memberDoc.create({
        userId: creatorId,
        createdTime: now,
    });
    // create GroupContractDocs for each contractId
    await Promise.all(contracts
        .map((c) => c.id)
        .map((contractId) => groupRef.collection('groupContracts').doc(contractId).create({
        contractId,
        createdTime: now,
    })));
    for (const market of contracts) {
        if ((_a = market.groupLinks) === null || _a === void 0 ? void 0 : _a.some((l) => l.groupId === group.id))
            continue; // already in that group
        const newGroupLinks = [
            ...((_b = market.groupLinks) !== null && _b !== void 0 ? _b : []),
            {
                groupId: group.id,
                createdTime: Date.now(),
                slug: group.slug,
                name: group.name,
            },
        ];
        await firestore
            .collection('contracts')
            .doc(market.id)
            .update({
            groupSlugs: (0, lodash_1.uniq)([...((_c = market.groupSlugs) !== null && _c !== void 0 ? _c : []), group.slug]),
            groupLinks: newGroupLinks,
        });
    }
    return { status: 'success', group: group };
};
const convertTagToGroup = async (tag, groupName) => {
    (0, utils_1.log)(`Looking up contract IDs with tag ${tag}...`);
    const contracts = await getTaggedContracts(tag);
    (0, utils_1.log)(`${contracts.length} contracts found.`);
    if (contracts.length > 0) {
        (0, utils_1.log)(`Creating group ${groupName}...`);
        const about = `Contracts that used to be tagged ${tag}.`;
        const result = await createGroup(groupName, about, contracts);
        (0, utils_1.log)(`Done. Group: `, result);
    }
};
if (require.main === module) {
    (0, script_init_1.initAdmin)();
    const args = process.argv.slice(2);
    if (args.length != 2) {
        console.log('Usage: convert-tag-to-group [tag] [group-name]');
    }
    else {
        convertTagToGroup(args[0], args[1]).catch((e) => console.error(e));
    }
}
//# sourceMappingURL=convert-tag-to-group.js.map
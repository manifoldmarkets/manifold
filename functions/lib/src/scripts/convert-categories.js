"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const categories_1 = require("common/categories");
const lodash_1 = require("lodash");
const array_1 = require("common/util/array");
const antes_1 = require("common/antes");
(0, script_init_1.initAdmin)();
const adminFirestore = admin.firestore();
const convertCategoriesToGroupsInternal = async (categories) => {
    var _a, _b, _c;
    for (const category of categories) {
        const markets = await (0, utils_1.getValues)(adminFirestore
            .collection('contracts')
            .where('lowercaseTags', 'array-contains', category.toLowerCase()));
        const slug = category.toLowerCase() + categories_1.CATEGORIES_GROUP_SLUG_POSTFIX;
        const oldGroup = await (0, utils_1.getValues)(adminFirestore.collection('groups').where('slug', '==', slug));
        if (oldGroup.length > 0) {
            console.log(`Found old group for ${category}`);
            await adminFirestore.collection('groups').doc(oldGroup[0].id).delete();
        }
        const allUsers = await (0, utils_1.getValues)(adminFirestore.collection('users'));
        const groupUsers = (0, array_1.filterDefined)(allUsers.map((user) => {
            if (!user.followedCategories || user.followedCategories.length === 0)
                return user.id;
            if (!user.followedCategories.includes(category.toLowerCase()))
                return null;
            return user.id;
        }));
        const manifoldAccount = (0, utils_1.isProd)()
            ? antes_1.HOUSE_LIQUIDITY_PROVIDER_ID
            : antes_1.DEV_HOUSE_LIQUIDITY_PROVIDER_ID;
        const newGroupRef = await adminFirestore.collection('groups').doc();
        const newGroup = {
            id: newGroupRef.id,
            name: category,
            slug,
            creatorId: manifoldAccount,
            createdTime: Date.now(),
            anyoneCanJoin: true,
            memberIds: [manifoldAccount],
            about: 'Default group for all things related to ' + category,
            mostRecentActivityTime: Date.now(),
            contractIds: markets.map((market) => market.id),
            chatDisabled: true,
        };
        await adminFirestore.collection('groups').doc(newGroupRef.id).set(newGroup);
        // Update group with new memberIds to avoid notifying everyone
        await adminFirestore
            .collection('groups')
            .doc(newGroupRef.id)
            .update({
            memberIds: (0, lodash_1.uniq)(groupUsers),
        });
        for (const market of markets) {
            if ((_a = market.groupLinks) === null || _a === void 0 ? void 0 : _a.map((l) => l.groupId).includes(newGroup.id))
                continue; // already in that group
            const newGroupLinks = [
                ...((_b = market.groupLinks) !== null && _b !== void 0 ? _b : []),
                {
                    groupId: newGroup.id,
                    createdTime: Date.now(),
                    slug: newGroup.slug,
                    name: newGroup.name,
                },
            ];
            await adminFirestore
                .collection('contracts')
                .doc(market.id)
                .update({
                groupSlugs: (0, lodash_1.uniq)([...((_c = market.groupSlugs) !== null && _c !== void 0 ? _c : []), newGroup.slug]),
                groupLinks: newGroupLinks,
            });
        }
    }
};
async function convertCategoriesToGroups() {
    // const defaultCategories = Object.values(DEFAULT_CATEGORIES)
    const moreCategories = ['world', 'culture'];
    await convertCategoriesToGroupsInternal(moreCategories);
}
if (require.main === module) {
    convertCategoriesToGroups()
        .then(() => process.exit())
        .catch(console.log);
}
//# sourceMappingURL=convert-categories.js.map
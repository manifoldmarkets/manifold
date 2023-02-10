"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("functions/src/utils");
const script_init_1 = require("functions/src/scripts/script-init");
const admin = require("firebase-admin");
const array_1 = require("common/util/array");
const lodash_1 = require("lodash");
(0, script_init_1.initAdmin)();
const adminFirestore = admin.firestore();
const addGroupIdToContracts = async () => {
    var _a, _b;
    const groups = await (0, utils_1.getValues)(adminFirestore.collection('groups'));
    for (const group of groups) {
        const groupContracts = await (0, utils_1.getValues)(adminFirestore
            .collection('contracts')
            .where('groupSlugs', 'array-contains', group.slug));
        for (const contract of groupContracts) {
            const oldGroupLinks = (_a = contract.groupLinks) === null || _a === void 0 ? void 0 : _a.filter((l) => l.slug != group.slug);
            const newGroupLinks = (0, array_1.filterDefined)([
                ...(oldGroupLinks !== null && oldGroupLinks !== void 0 ? oldGroupLinks : []),
                group.id
                    ? {
                        slug: group.slug,
                        name: group.name,
                        groupId: group.id,
                        createdTime: Date.now(),
                    }
                    : undefined,
            ]);
            await adminFirestore
                .collection('contracts')
                .doc(contract.id)
                .update({
                groupSlugs: (0, lodash_1.uniq)([...((_b = contract.groupSlugs) !== null && _b !== void 0 ? _b : []), group.slug]),
                groupLinks: newGroupLinks,
            });
        }
    }
};
if (require.main === module) {
    addGroupIdToContracts()
        .then(() => process.exit())
        .catch(console.log);
}
//# sourceMappingURL=link-contracts-to-groups.js.map
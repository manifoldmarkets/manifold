"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupPath = exports.filterTopGroups = exports.GROUP_CHAT_SLUG = exports.NEW_USER_GROUP_SLUGS = exports.MAX_ID_LENGTH = exports.MAX_ABOUT_LENGTH = exports.MAX_GROUP_NAME_LENGTH = void 0;
const lodash_1 = require("lodash");
exports.MAX_GROUP_NAME_LENGTH = 75;
exports.MAX_ABOUT_LENGTH = 140;
exports.MAX_ID_LENGTH = 60;
exports.NEW_USER_GROUP_SLUGS = ['updates', 'bugs', 'welcome'];
exports.GROUP_CHAT_SLUG = 'chat';
const excludedGroups = [
    'features',
    'personal',
    'private',
    'nomic',
    'proofnik',
    'free money',
    'motivation',
    'sf events',
    'please resolve',
    'short-term',
    'washifold',
];
function filterTopGroups(groups, n = 100, excludeGroups = true) {
    return (0, lodash_1.sortBy)(groups, (group) => {
        var _a;
        return -(group.totalMembers + group.totalContracts) *
            (((_a = group.mostRecentContractAddedTime) !== null && _a !== void 0 ? _a : 0) >
                Date.now() - 1000 * 60 * 60 * 24 * 7
                ? 2
                : 1);
    })
        .filter((group) => group.anyoneCanJoin)
        .filter((group) => excludeGroups
        ? excludedGroups.every((name) => !group.name.toLowerCase().includes(name))
        : true)
        .slice(0, n);
}
exports.filterTopGroups = filterTopGroups;
function groupPath(groupSlug, subpath) {
    return `/group/${groupSlug}${subpath ? `/${subpath}` : ''}`;
}
exports.groupPath = groupPath;
//# sourceMappingURL=group.js.map
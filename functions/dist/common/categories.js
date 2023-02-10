"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CATEGORY_GROUPS = exports.DEFAULT_CATEGORIES = exports.EXCLUDED_CATEGORIES = exports.CATEGORY_LIST = exports.TO_CATEGORY = exports.CATEGORIES = exports.CATEGORIES_GROUP_SLUG_POSTFIX = void 0;
const lodash_1 = require("lodash");
exports.CATEGORIES_GROUP_SLUG_POSTFIX = '-default';
exports.CATEGORIES = {
    politics: 'Politics',
    technology: 'Technology',
    science: 'Science',
    world: 'World',
    sports: 'Sports',
    economics: 'Economics',
    personal: 'Personal',
    culture: 'Culture',
    manifold: 'Manifold',
    covid: 'Covid',
    crypto: 'Crypto',
    gaming: 'Gaming',
    fun: 'Fun',
};
exports.TO_CATEGORY = Object.fromEntries(Object.entries(exports.CATEGORIES).map(([k, v]) => [v, k]));
exports.CATEGORY_LIST = Object.keys(exports.CATEGORIES);
exports.EXCLUDED_CATEGORIES = [
    'fun',
    'manifold',
    'personal',
    'covid',
    'gaming',
    'crypto',
];
exports.DEFAULT_CATEGORIES = (0, lodash_1.difference)(exports.CATEGORY_LIST, exports.EXCLUDED_CATEGORIES);
exports.DEFAULT_CATEGORY_GROUPS = exports.DEFAULT_CATEGORIES.map((c) => ({
    slug: c.toLowerCase() + exports.CATEGORIES_GROUP_SLUG_POSTFIX,
    name: exports.CATEGORIES[c],
}));
//# sourceMappingURL=categories.js.map
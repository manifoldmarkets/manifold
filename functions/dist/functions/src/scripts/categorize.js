"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const openai_utils_1 = require("../helpers/openai-utils");
async function main(question) {
    console.log('finding group for question:', question);
    const group = await (0, openai_utils_1.getGroupForMarket)(question);
    console.log(group === null || group === void 0 ? void 0 : group.name);
}
if (require.main === module) {
    main(process.argv[2]).then(() => process.exit());
}
//# sourceMappingURL=categorize.js.map
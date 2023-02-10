"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const openai_utils_1 = require("../helpers/openai-utils");
async function main(question) {
    console.log('Generating prompt for question:', question);
    await (0, openai_utils_1.getImagePrompt)(question);
}
if (require.main === module) {
    main(process.argv[2]).then(() => process.exit());
}
//# sourceMappingURL=generate-image-prompts.js.map
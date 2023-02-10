"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
const utils_1 = require("../utils");
const app = (0, script_init_1.initAdmin)();
const ONE_YEAR_SECS = 60 * 60 * 24 * 365;
const AVATAR_EXTENSION_RE = /\.(gif|tiff|jpe?g|png|webp)$/i;
const processAvatars = async () => {
    const storage = app.storage();
    const bucket = storage.bucket(`${app.options.projectId}.appspot.com`);
    const [files] = await bucket.getFiles({ prefix: 'user-images' });
    (0, utils_1.log)(`${files.length} avatar images to process.`);
    for (const file of files) {
        if (AVATAR_EXTENSION_RE.test(file.name)) {
            (0, utils_1.log)(`Updating metadata for ${file.name}.`);
            await file.setMetadata({
                cacheControl: `public, max-age=${ONE_YEAR_SECS}`,
            });
        }
        else {
            (0, utils_1.log)(`Skipping ${file.name} because it probably isn't an avatar.`);
        }
    }
};
if (require.main === module) {
    processAvatars().catch((e) => console.error(e));
}
//# sourceMappingURL=set-avatar-cache-headers.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const script_init_1 = require("./script-init");
(0, script_init_1.initAdmin)();
const utils_1 = require("../utils");
const change_user_info_1 = require("../change-user-info");
async function main() {
    const username = process.argv[2];
    const name = process.argv[3];
    const newUsername = process.argv[4];
    const avatarUrl = process.argv[5];
    if (process.argv.length < 4) {
        console.log('syntax: node change-user-info.js [current username] [new name] [new username] [new avatar]');
        return;
    }
    const user = await (0, utils_1.getUserByUsername)(username);
    if (!user) {
        console.log('username', username, 'could not be found');
        return;
    }
    await (0, change_user_info_1.changeUser)(user, { username: newUsername, name, avatarUrl })
        .then(() => console.log('succesfully changed', user.username, 'to', name, avatarUrl, newUsername))
        .catch((e) => console.log(e.message));
}
if (require.main === module)
    main().then(() => process.exit());
//# sourceMappingURL=change-user-info.js.map
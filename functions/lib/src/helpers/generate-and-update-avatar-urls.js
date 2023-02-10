"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAvatarUrl = exports.generateAndUpdateAvatarUrls = void 0;
const admin = require("firebase-admin");
const storage_1 = require("firebase-admin/storage");
const node_fetch_1 = require("node-fetch");
const constants_1 = require("../../../common/envs/constants");
const firestore = admin.firestore();
const generateAndUpdateAvatarUrls = async (users) => {
    const storage = (0, storage_1.getStorage)();
    const bucket = storage.bucket();
    console.log('bucket name', bucket.name);
    await Promise.all(users.map(async (user) => {
        const userDoc = firestore.collection('users').doc(user.id);
        console.log('backfilling user avatar:', user.id);
        const avatarUrl = await (0, exports.generateAvatarUrl)(user.id, user.name, bucket);
        await userDoc.update({ avatarUrl });
    }));
};
exports.generateAndUpdateAvatarUrls = generateAndUpdateAvatarUrls;
const generateAvatarUrl = async (userId, name, bucket) => {
    const backgroundColors = [
        '#FF8C00',
        '#800080',
        '#00008B',
        '#008000',
        '#A52A2A',
        '#555555',
        '#008080',
    ];
    const imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${encodeURIComponent(backgroundColors[Math.floor(Math.random() * backgroundColors.length)])}&color=fff&size=256&format=png`;
    try {
        const res = await (0, node_fetch_1.default)(imageUrl);
        const buffer = await res.arrayBuffer();
        return await upload(userId, Buffer.from(buffer), bucket);
    }
    catch (e) {
        console.log('error generating avatar', e);
        return `https://${constants_1.DOMAIN}/images/default-avatar.png`;
    }
};
exports.generateAvatarUrl = generateAvatarUrl;
async function upload(userId, buffer, bucket) {
    const filename = `user-images/${userId}.png`;
    let file = bucket.file(filename);
    const exists = await file.exists();
    if (exists[0]) {
        await file.delete();
        file = bucket.file(filename);
    }
    await file.save(buffer, {
        private: false,
        public: true,
        metadata: { contentType: 'image/png' },
    });
    return `https://storage.googleapis.com/${bucket.cloudStorageURI.hostname}/${filename}`;
}
//# sourceMappingURL=generate-and-update-avatar-urls.js.map
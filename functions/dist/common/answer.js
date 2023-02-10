"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ANSWER_LENGTH = exports.getNoneAnswer = void 0;
const getNoneAnswer = (contractId, creator) => {
    const { username, name, avatarUrl } = creator;
    return {
        id: '0',
        number: 0,
        contractId,
        createdTime: Date.now(),
        userId: creator.id,
        username,
        name,
        avatarUrl,
        text: 'None',
    };
};
exports.getNoneAnswer = getNoneAnswer;
exports.MAX_ANSWER_LENGTH = 240;
//# sourceMappingURL=answer.js.map
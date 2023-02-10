"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateAnswer = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
exports.onCreateAnswer = functions.firestore
    .document('contracts/{contractId}/answers/{answerNumber}')
    .onCreate(async (change, context) => {
    const { contractId } = context.params;
    const { eventId } = context;
    const answer = change.data();
    // Ignore ante answer.
    if (answer.number === 0)
        return;
    const contract = await (0, utils_1.getContract)(contractId);
    if (!contract)
        throw new Error('Could not find contract corresponding with answer');
    const answerCreator = await (0, utils_1.getUser)(answer.userId);
    if (!answerCreator)
        throw new Error('Could not find answer creator');
    await (0, create_notification_1.createCommentOrAnswerOrUpdatedContractNotification)(answer.id, 'answer', 'created', answerCreator, eventId, answer.text, contract);
});
//# sourceMappingURL=on-create-answer.js.map
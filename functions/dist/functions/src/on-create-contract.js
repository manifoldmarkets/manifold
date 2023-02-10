"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onCreateContract = void 0;
const functions = require("firebase-functions");
const utils_1 = require("./utils");
const create_notification_1 = require("./create-notification");
const parse_1 = require("../../common/util/parse");
const follow_market_1 = require("./follow-market");
const dream_utils_1 = require("./dream-utils");
const openai_utils_1 = require("./helpers/openai-utils");
exports.onCreateContract = functions
    .runWith({ secrets: ['MAILGUN_KEY', 'DREAM_KEY', 'OPENAI_API_KEY'] })
    .firestore.document('contracts/{contractId}')
    .onCreate(async (snapshot, context) => {
    const contract = snapshot.data();
    const { eventId } = context;
    const contractCreator = await (0, utils_1.getUser)(contract.creatorId);
    if (!contractCreator)
        throw new Error('Could not find contract creator');
    const desc = contract.description;
    const mentioned = (0, parse_1.parseMentions)(desc);
    await (0, follow_market_1.addUserToContractFollowers)(contract.id, contractCreator.id);
    await (0, create_notification_1.createNewContractNotification)(contractCreator, contract, eventId, (0, parse_1.richTextToString)(desc), mentioned);
    const imagePrompt = await (0, openai_utils_1.getImagePrompt)(contract.question);
    const coverImageUrl = await (0, dream_utils_1.dreamWithDefaultParams)(imagePrompt !== null && imagePrompt !== void 0 ? imagePrompt : contract.question);
    await snapshot.ref.update({
        coverImageUrl,
    });
});
//# sourceMappingURL=on-create-contract.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContractFromSlug = exports.createmarket = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const contract_1 = require("../../common/contract");
const slugify_1 = require("../../common/util/slugify");
const random_1 = require("../../common/util/random");
const utils_1 = require("./utils");
const api_1 = require("./api");
const antes_1 = require("../../common/antes");
const answer_1 = require("../../common/answer");
const new_contract_1 = require("../../common/new-contract");
const numeric_constants_1 = require("../../common/numeric-constants");
const group_1 = require("../../common/group");
const pseudo_numeric_1 = require("../../common/pseudo-numeric");
const lodash_1 = require("lodash");
const descScehma = zod_1.z.lazy(() => zod_1.z.intersection(zod_1.z.record(zod_1.z.any()), zod_1.z.object({
    type: zod_1.z.string().optional(),
    attrs: zod_1.z.record(zod_1.z.any()).optional(),
    content: zod_1.z.array(descScehma).optional(),
    marks: zod_1.z
        .array(zod_1.z.intersection(zod_1.z.record(zod_1.z.any()), zod_1.z.object({
        type: zod_1.z.string(),
        attrs: zod_1.z.record(zod_1.z.any()).optional(),
    })))
        .optional(),
    text: zod_1.z.string().optional(),
})));
const bodySchema = zod_1.z.object({
    question: zod_1.z.string().min(1).max(contract_1.MAX_QUESTION_LENGTH),
    description: descScehma.optional(),
    tags: zod_1.z.array(zod_1.z.string().min(1).max(contract_1.MAX_TAG_LENGTH)).optional(),
    closeTime: (0, api_1.zTimestamp)().refine((date) => date.getTime() > new Date().getTime(), 'Close time must be in the future.'),
    outcomeType: zod_1.z.enum(contract_1.OUTCOME_TYPES),
    groupId: zod_1.z.string().min(1).max(group_1.MAX_ID_LENGTH).optional(),
});
const binarySchema = zod_1.z.object({
    initialProb: zod_1.z.number().min(1).max(99),
});
const finite = () => zod_1.z.number().gte(Number.MIN_SAFE_INTEGER).lte(Number.MAX_SAFE_INTEGER);
const numericSchema = zod_1.z.object({
    min: finite(),
    max: finite(),
    initialValue: finite(),
    isLogScale: zod_1.z.boolean().optional(),
});
const multipleChoiceSchema = zod_1.z.object({
    answers: zod_1.z.string().trim().min(1).array().min(2),
});
exports.createmarket = (0, api_1.newEndpoint)({}, async (req, auth) => {
    const { question, description, tags, closeTime, outcomeType, groupId } = (0, api_1.validate)(bodySchema, req.body);
    let min, max, initialProb, isLogScale, answers;
    if (outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMERIC') {
        let initialValue;
        ({ min, max, initialValue, isLogScale } = (0, api_1.validate)(numericSchema, req.body));
        if (max - min <= 0.01 || initialValue <= min || initialValue >= max)
            throw new api_1.APIError(400, 'Invalid range.');
        initialProb = (0, pseudo_numeric_1.getPseudoProbability)(initialValue, min, max, isLogScale) * 100;
        if (initialProb < 1 || initialProb > 99)
            if (outcomeType === 'PSEUDO_NUMERIC')
                throw new api_1.APIError(400, `Initial value is too ${initialProb < 1 ? 'low' : 'high'}`);
            else
                throw new api_1.APIError(400, 'Invalid initial probability.');
    }
    if (outcomeType === 'BINARY') {
        ;
        ({ initialProb } = (0, api_1.validate)(binarySchema, req.body));
    }
    if (outcomeType === 'MULTIPLE_CHOICE') {
        ;
        ({ answers } = (0, api_1.validate)(multipleChoiceSchema, req.body));
    }
    const userDoc = await firestore.collection('users').doc(auth.uid).get();
    if (!userDoc.exists) {
        throw new api_1.APIError(400, 'No user exists with the authenticated user ID.');
    }
    const user = userDoc.data();
    const ante = antes_1.FIXED_ANTE;
    // TODO: this is broken because it's not in a transaction
    if (ante > user.balance)
        throw new api_1.APIError(400, `Balance must be at least ${ante}.`);
    const slug = await getSlug(question);
    const contractRef = firestore.collection('contracts').doc();
    let group = null;
    if (groupId) {
        const groupDocRef = firestore.collection('groups').doc(groupId);
        const groupDoc = await groupDocRef.get();
        if (!groupDoc.exists) {
            throw new api_1.APIError(400, 'No group exists with the given group ID.');
        }
        group = groupDoc.data();
        if (!group.memberIds.includes(user.id)) {
            throw new api_1.APIError(400, 'User must be a member of the group to add markets to it.');
        }
        if (!group.contractIds.includes(contractRef.id))
            await groupDocRef.update({
                contractIds: [...group.contractIds, contractRef.id],
            });
    }
    console.log('creating contract for', user.username, 'on', question, 'ante:', ante || 0);
    const contract = (0, new_contract_1.getNewContract)(contractRef.id, slug, user, question, outcomeType, description !== null && description !== void 0 ? description : {}, initialProb !== null && initialProb !== void 0 ? initialProb : 0, ante, closeTime.getTime(), tags !== null && tags !== void 0 ? tags : [], numeric_constants_1.NUMERIC_BUCKET_COUNT, min !== null && min !== void 0 ? min : 0, max !== null && max !== void 0 ? max : 0, isLogScale !== null && isLogScale !== void 0 ? isLogScale : false, answers !== null && answers !== void 0 ? answers : []);
    if (ante)
        await (0, utils_1.chargeUser)(user.id, ante, true);
    await contractRef.create(contract);
    const providerId = user.id;
    if (outcomeType === 'BINARY' || outcomeType === 'PSEUDO_NUMERIC') {
        const liquidityDoc = firestore
            .collection(`contracts/${contract.id}/liquidity`)
            .doc();
        const lp = (0, antes_1.getCpmmInitialLiquidity)(providerId, contract, liquidityDoc.id, ante);
        await liquidityDoc.set(lp);
    }
    else if (outcomeType === 'MULTIPLE_CHOICE') {
        const betCol = firestore.collection(`contracts/${contract.id}/bets`);
        const betDocs = (answers !== null && answers !== void 0 ? answers : []).map(() => betCol.doc());
        const answerCol = firestore.collection(`contracts/${contract.id}/answers`);
        const answerDocs = (answers !== null && answers !== void 0 ? answers : []).map((_, i) => answerCol.doc(i.toString()));
        const { bets, answerObjects } = (0, antes_1.getMultipleChoiceAntes)(user, contract, answers !== null && answers !== void 0 ? answers : [], betDocs.map((bd) => bd.id));
        await Promise.all((0, lodash_1.zip)(bets, betDocs).map(([bet, doc]) => doc === null || doc === void 0 ? void 0 : doc.create(bet)));
        await Promise.all((0, lodash_1.zip)(answerObjects, answerDocs).map(([answer, doc]) => doc === null || doc === void 0 ? void 0 : doc.create(answer)));
        await contractRef.update({ answers: answerObjects });
    }
    else if (outcomeType === 'FREE_RESPONSE') {
        const noneAnswerDoc = firestore
            .collection(`contracts/${contract.id}/answers`)
            .doc('0');
        const noneAnswer = (0, answer_1.getNoneAnswer)(contract.id, user);
        await noneAnswerDoc.set(noneAnswer);
        const anteBetDoc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc();
        const anteBet = (0, antes_1.getFreeAnswerAnte)(providerId, contract, anteBetDoc.id);
        await anteBetDoc.set(anteBet);
    }
    else if (outcomeType === 'NUMERIC') {
        const anteBetDoc = firestore
            .collection(`contracts/${contract.id}/bets`)
            .doc();
        const anteBet = (0, antes_1.getNumericAnte)(providerId, contract, ante, anteBetDoc.id);
        await anteBetDoc.set(anteBet);
    }
    return contract;
});
const getSlug = async (question) => {
    const proposedSlug = (0, slugify_1.slugify)(question);
    const preexistingContract = await getContractFromSlug(proposedSlug);
    return preexistingContract
        ? proposedSlug + '-' + (0, random_1.randomString)()
        : proposedSlug;
};
const firestore = admin.firestore();
async function getContractFromSlug(slug) {
    const snap = await firestore
        .collection('contracts')
        .where('slug', '==', slug)
        .get();
    return snap.empty ? undefined : snap.docs[0].data();
}
exports.getContractFromSlug = getContractFromSlug;
//# sourceMappingURL=create-contract.js.map
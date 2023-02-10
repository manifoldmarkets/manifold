"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContractFromSlug = exports.createMarketHelper = exports.createmarket = void 0;
const admin = require("firebase-admin");
const zod_1 = require("zod");
const firestore_1 = require("firebase-admin/firestore");
const lodash_1 = require("lodash");
const contract_1 = require("../../common/contract");
const slugify_1 = require("../../common/util/slugify");
const random_1 = require("../../common/util/random");
const utils_1 = require("./utils");
const api_1 = require("./api");
const economy_1 = require("../../common/economy");
const antes_1 = require("../../common/antes");
const answer_1 = require("../../common/answer");
const new_contract_1 = require("../../common/new-contract");
const numeric_constants_1 = require("../../common/numeric-constants");
const group_1 = require("../../common/group");
const pseudo_numeric_1 = require("../../common/pseudo-numeric");
const openai_utils_1 = require("./helpers/openai-utils");
const marked_1 = require("marked");
const cert_txns_1 = require("./helpers/cert-txns");
const descSchema = zod_1.z.lazy(() => zod_1.z.intersection(zod_1.z.record(zod_1.z.any()), zod_1.z.object({
    type: zod_1.z.string().optional(),
    attrs: zod_1.z.record(zod_1.z.any()).optional(),
    content: zod_1.z.array(descSchema).optional(),
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
    description: descSchema.or(zod_1.z.string()).optional(),
    descriptionHtml: zod_1.z.string().optional(),
    descriptionMarkdown: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string().min(1).max(contract_1.MAX_TAG_LENGTH)).optional(),
    closeTime: (0, api_1.zTimestamp)()
        .refine((date) => date.getTime() > new Date().getTime(), 'Close time must be in the future.')
        .optional(),
    outcomeType: zod_1.z.enum(contract_1.OUTCOME_TYPES),
    groupId: zod_1.z.string().min(1).max(group_1.MAX_ID_LENGTH).optional(),
    visibility: zod_1.z.enum(contract_1.VISIBILITIES).optional(),
    isTwitchContract: zod_1.z.boolean().optional(),
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
exports.createmarket = (0, api_1.newEndpoint)({ secrets: ['OPENAI_API_KEY'] }, (req, auth) => {
    return createMarketHelper(req.body, auth);
});
async function createMarketHelper(body, auth) {
    var _a;
    const { question, description, descriptionHtml, descriptionMarkdown, tags, closeTime, outcomeType, groupId, visibility = 'public', isTwitchContract, } = (0, api_1.validate)(bodySchema, body);
    let min, max, initialProb, isLogScale, answers;
    if (outcomeType === 'PSEUDO_NUMERIC' || outcomeType === 'NUMERIC') {
        let initialValue;
        ({ min, max, initialValue, isLogScale } = (0, api_1.validate)(numericSchema, body));
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
        ({ initialProb } = (0, api_1.validate)(binarySchema, body));
    }
    if (outcomeType === 'MULTIPLE_CHOICE') {
        ;
        ({ answers } = (0, api_1.validate)(multipleChoiceSchema, body));
    }
    const userId = auth.uid;
    let group = null;
    if (groupId) {
        const groupDocRef = firestore.collection('groups').doc(groupId);
        const groupDoc = await groupDocRef.get();
        if (!groupDoc.exists) {
            throw new api_1.APIError(400, 'No group exists with the given group ID.');
        }
        group = groupDoc.data();
        const groupMembersSnap = await firestore
            .collection(`groups/${groupId}/groupMembers`)
            .get();
        const groupMemberDocs = groupMembersSnap.docs.map((doc) => doc.data());
        if (!groupMemberDocs.some((m) => m.userId === userId) &&
            group.creatorId !== userId) {
            throw new api_1.APIError(400, 'User must be a member/creator of the group or group must be open to add markets to it.');
        }
    }
    const slug = await getSlug(question);
    const contractRef = firestore.collection('contracts').doc();
    // convert string descriptions into JSONContent
    let descriptionJson = null;
    if (description) {
        if (typeof description === 'string') {
            descriptionJson = (0, utils_1.htmlToRichText)(`<p>${description}</p>`);
        }
        else {
            descriptionJson = description;
        }
    }
    else if (descriptionHtml) {
        descriptionJson = (0, utils_1.htmlToRichText)(descriptionHtml);
    }
    else if (descriptionMarkdown) {
        descriptionJson = (0, utils_1.htmlToRichText)(marked_1.marked.parse(descriptionMarkdown));
    }
    else {
        // Use a single empty space as the description
        descriptionJson = (0, utils_1.htmlToRichText)('<p> </p>');
    }
    const ante = economy_1.ANTES[outcomeType];
    const user = await firestore.runTransaction(async (trans) => {
        const userDoc = await trans.get(firestore.collection('users').doc(userId));
        if (!userDoc.exists)
            throw new api_1.APIError(400, 'No user exists with the authenticated user ID.');
        const user = userDoc.data();
        if (ante > user.balance)
            throw new api_1.APIError(400, `Balance must be at least ${ante}.`);
        trans.update(userDoc.ref, {
            balance: firestore_1.FieldValue.increment(-ante),
            totalDeposits: firestore_1.FieldValue.increment(-ante),
        });
        return user;
    });
    const closeTimestamp = closeTime
        ? closeTime.getTime()
        : // Use AI to get date, default to one week after now if failure
            (_a = (await (0, openai_utils_1.getCloseDate)(question))) !== null && _a !== void 0 ? _a : Date.now() + 7 * 24 * 60 * 60 * 1000;
    const contract = (0, new_contract_1.getNewContract)(contractRef.id, slug, user, question, outcomeType, descriptionJson, initialProb !== null && initialProb !== void 0 ? initialProb : 0, ante, closeTimestamp, tags !== null && tags !== void 0 ? tags : [], numeric_constants_1.NUMERIC_BUCKET_COUNT, min !== null && min !== void 0 ? min : 0, max !== null && max !== void 0 ? max : 0, isLogScale !== null && isLogScale !== void 0 ? isLogScale : false, answers !== null && answers !== void 0 ? answers : [], visibility, isTwitchContract ? true : undefined);
    await contractRef.create(contract);
    console.log('created contract for', user.username, 'on', question, 'ante:', ante || 0);
    if (group != null) {
        const groupContractsSnap = await firestore
            .collection(`groups/${groupId}/groupContracts`)
            .get();
        const groupContracts = groupContractsSnap.docs.map((doc) => doc.data());
        if (!groupContracts.some((c) => c.contractId === contractRef.id)) {
            await createGroupLinks(group, [contractRef.id], auth.uid);
            const groupContractRef = firestore
                .collection(`groups/${groupId}/groupContracts`)
                .doc(contract.id);
            await groupContractRef.set({
                contractId: contract.id,
                createdTime: Date.now(),
            });
        }
    }
    const providerId = userId;
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
    else if (outcomeType === 'CERT') {
        const DEFAULT_SHARES = 10000;
        // Unlike other contracts which initializing info into the contract's doc or subcollection,
        // certs have the mint and pool specified in txn
        await (0, cert_txns_1.mintAndPoolCert)(providerId, contract.id, DEFAULT_SHARES, ante);
    }
    else if (outcomeType === 'QUADRATIC_FUNDING') {
        const txnDoc = firestore.collection('txns').doc();
        const txn = {
            id: txnDoc.id,
            category: 'QF_ADD_POOL',
            createdTime: Date.now(),
            fromId: providerId,
            fromType: 'USER',
            toId: contract.id,
            toType: 'CONTRACT',
            amount: ante,
            token: 'M$',
            qfId: contract.id,
        };
        await txnDoc.set(txn);
    }
    return contract;
}
exports.createMarketHelper = createMarketHelper;
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
async function createGroupLinks(group, contractIds, userId) {
    var _a, _b, _c, _d;
    for (const contractId of contractIds) {
        const contract = await (0, utils_1.getContract)(contractId);
        if (!((_a = contract === null || contract === void 0 ? void 0 : contract.groupSlugs) === null || _a === void 0 ? void 0 : _a.includes(group.slug))) {
            await firestore
                .collection('contracts')
                .doc(contractId)
                .update({
                groupSlugs: (0, lodash_1.uniq)([group.slug, ...((_b = contract === null || contract === void 0 ? void 0 : contract.groupSlugs) !== null && _b !== void 0 ? _b : [])]),
            });
        }
        if (!((_c = contract === null || contract === void 0 ? void 0 : contract.groupLinks) === null || _c === void 0 ? void 0 : _c.some((gl) => gl.groupId === group.id))) {
            await firestore
                .collection('contracts')
                .doc(contractId)
                .update({
                groupLinks: [
                    {
                        groupId: group.id,
                        name: group.name,
                        slug: group.slug,
                        userId,
                        createdTime: Date.now(),
                    },
                    ...((_d = contract === null || contract === void 0 ? void 0 : contract.groupLinks) !== null && _d !== void 0 ? _d : []),
                ],
            });
        }
    }
}
//# sourceMappingURL=create-market.js.map
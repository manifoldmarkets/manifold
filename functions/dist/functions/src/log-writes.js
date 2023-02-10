"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTest = exports.logPosts = exports.logManalinks = exports.logTxns = exports.logGroupMembers = exports.logGroupContracts = exports.logGroups = exports.logContractLiquidity = exports.logContractFollows = exports.logContractComments = exports.logContractBets = exports.logContractAnswers = exports.logContracts = exports.logUserSeenMarkets = exports.logUserEvents = exports.logUserReactions = exports.logUserFollows = exports.logUserContractMetrics = exports.logUserPortfolioHistories = exports.logUsers = void 0;
const functions = require("firebase-functions");
const pubsub_1 = require("@google-cloud/pubsub");
const pubSubClient = new pubsub_1.PubSub();
const writeTopic = pubSubClient.topic('firestoreWrite');
function getWriteInfo(change) {
    const { before, after } = change;
    if (before.exists && after.exists) {
        return { kind: 'update', ref: after.ref, data: after.data() };
    }
    else if (before.exists && !after.exists) {
        return { kind: 'delete', ref: before.ref, data: null };
    }
    else if (!before.exists && after.exists) {
        return { kind: 'create', ref: after.ref, data: after.data() };
    }
    else {
        throw new Error("Mysterious write; can't log.");
    }
}
function getTLEntry(change, context, tableName) {
    var _a;
    const info = getWriteInfo(change);
    return {
        tableId: tableName,
        writeKind: info.kind,
        eventId: context.eventId,
        docId: info.ref.id,
        parentId: (_a = context.params['parent']) !== null && _a !== void 0 ? _a : null,
        path: info.ref.path,
        data: info.data,
        ts: Date.parse(context.timestamp).valueOf(),
    };
}
function logger(path, tableName) {
    return functions.firestore.document(path).onWrite(async (change, ctx) => {
        const entry = getTLEntry(change, ctx, tableName);
        const messageId = await writeTopic.publishMessage({ json: entry });
        console.log(`Published: messageId=${messageId} eventId=${entry.eventId} kind=${entry.writeKind} docId=${entry.docId} parentId=${entry.parentId}`);
    });
}
exports.logUsers = logger('users/{id}', 'users');
exports.logUserPortfolioHistories = logger('users/{parent}/portfolioHistory/{id}', 'user_portfolio_history');
exports.logUserContractMetrics = logger('users/{parent}/contract-metrics/{id}', 'user_contract_metrics');
exports.logUserFollows = logger('users/{parent}/follows/{id}', 'user_follows');
exports.logUserReactions = logger('users/{parent}/reactions/{id}', 'user_reactions');
exports.logUserEvents = logger('users/{parent}/events/{id}', 'user_events');
exports.logUserSeenMarkets = logger('private-users/{parent}/seenMarkets/{id}', 'user_seen_markets');
exports.logContracts = logger('contracts/{id}', 'contracts');
exports.logContractAnswers = logger('contracts/{parent}/answers/{id}', 'contract_answers');
exports.logContractBets = logger('contracts/{parent}/bets/{id}', 'contract_bets');
exports.logContractComments = logger('contracts/{parent}/comments/{id}', 'contract_comments');
exports.logContractFollows = logger('contracts/{parent}/follows/{id}', 'contract_follows');
exports.logContractLiquidity = logger('contracts/{parent}/liquidity/{id}', 'contract_liquidity');
exports.logGroups = logger('groups/{id}', 'groups');
exports.logGroupContracts = logger('groups/{parent}/groupContracts/{id}', 'group_contracts');
exports.logGroupMembers = logger('groups/{parent}/groupMembers/{id}', 'group_members');
exports.logTxns = logger('txns/{id}', 'txns');
exports.logManalinks = logger('manalinks/{id}', 'manalinks');
exports.logPosts = logger('posts/{id}', 'posts');
exports.logTest = logger('test/{id}', 'test');
//# sourceMappingURL=log-writes.js.map
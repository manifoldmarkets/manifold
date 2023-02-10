"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dividendTxns = exports.buyFromPool = exports.mintAndPoolCert = void 0;
const format_1 = require("../../../common/util/format");
const admin = require("firebase-admin");
const firestore = admin.firestore();
// Note: this does NOT validate that the user has enough mana
async function mintAndPoolCert(userId, certId, mintShares, poolShares) {
    const batch = firestore.batch();
    const time = Date.now();
    // First, create one txn for minting the shares
    const ref1 = firestore.collection('txns').doc();
    const certMintTxn = {
        category: 'CERT_MINT',
        id: ref1.id,
        certId,
        createdTime: time,
        fromId: 'BANK',
        fromType: 'BANK',
        toId: userId,
        toType: 'USER',
        token: 'SHARE',
        amount: mintShares,
        description: `USER/${userId} minted ${mintShares} shares`,
    };
    batch.set(ref1, certMintTxn);
    // Currently assumes that the pool is set up with equal shares and M$
    const poolMana = poolShares;
    // Then, create two txns for setting up the pool at t=time+1
    const ref2 = firestore.collection('txns').doc();
    const certTransferTxn = {
        category: 'CERT_TRANSFER',
        id: ref2.id,
        certId,
        createdTime: time + 1,
        fromId: userId,
        fromType: 'USER',
        toId: certId,
        toType: 'CONTRACT',
        token: 'SHARE',
        amount: poolShares,
        description: `USER/${userId} added ${poolShares} shares to pool`,
    };
    batch.set(ref2, certTransferTxn);
    const ref3 = firestore.collection('txns').doc();
    const certPayManaTxn = {
        category: 'CERT_PAY_MANA',
        id: ref3.id,
        certId,
        createdTime: time + 1,
        fromId: userId,
        fromType: 'USER',
        toId: certId,
        toType: 'CONTRACT',
        token: 'M$',
        amount: poolMana,
        description: `USER/${userId} added ${(0, format_1.formatMoney)(poolMana)} to pool`,
    };
    batch.set(ref3, certPayManaTxn);
    return await batch.commit();
}
exports.mintAndPoolCert = mintAndPoolCert;
// In a batch, add two txns for transferring a cert in exchange for mana
// TODO: Should we generate a "betId" representing this transaction?
function buyFromPool(userId, certId, 
// Positive if we're removing shares from pool; negative if adding
shares, mana, transaction) {
    const time = Date.now();
    // First, create one txn for transferring the shares
    const ref1 = firestore.collection('txns').doc();
    const certTransferTxn = {
        category: 'CERT_TRANSFER',
        id: ref1.id,
        certId,
        createdTime: time,
        fromId: certId,
        fromType: 'CONTRACT',
        toId: userId,
        toType: 'USER',
        token: 'SHARE',
        amount: shares,
        description: `USER/${userId} bought ${shares} shares from pool`,
    };
    transaction.set(ref1, certTransferTxn);
    // Then, create one txn for transferring the mana
    const ref2 = firestore.collection('txns').doc();
    const certPayManaTxn = {
        category: 'CERT_PAY_MANA',
        id: ref2.id,
        certId,
        createdTime: time,
        fromId: userId,
        fromType: 'USER',
        toId: certId,
        toType: 'CONTRACT',
        token: 'M$',
        amount: mana,
        description: `USER/${userId} paid ${(0, format_1.formatMoney)(mana)} to pool`,
    };
    transaction.set(ref2, certPayManaTxn);
}
exports.buyFromPool = buyFromPool;
function dividendTxns(transaction, providerId, certId, payouts) {
    // Create one CertDividend for each recipient
    payouts.forEach(({ userId, payout }) => {
        const ref = firestore.collection('txns').doc();
        const certDividendTxn = {
            category: 'CERT_DIVIDEND',
            id: ref.id,
            certId: certId,
            createdTime: Date.now(),
            fromId: providerId,
            fromType: 'USER',
            toId: userId,
            toType: 'USER',
            token: 'M$',
            amount: payout,
            description: `USER/${providerId} paid ${(0, format_1.formatMoney)(payout)} dividend to USER/${userId}`,
        };
        transaction.set(ref, certDividendTxn);
    });
}
exports.dividendTxns = dividendTxns;
/*
txns for minting:
{
  fromId: 'BANK'
  toId: 'user/alice'
  amount: 10_000
  token: 'SHARE'
  description: 'user/alice mints 10_000 shares'
}

txns for initializing pool:
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'SHARE'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}
{
  fromId: 'user/alice'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/alice adds 500 shares & 500 M$ to pool'
}

txns for buying:
{
  fromId: 'user/bob'
  toId: 'contract/cert1234'
  amount: 500
  token: 'M$'
  description: 'user/bob pays 500 M$ for 250 shares'
}
{
  fromId: 'contract/cert1234'
  toId: 'user/bob'
  amount: 250
  token: 'SHARE'
  description: 'user/bob pays 500 M$ for 250 shares'
}

txns for gifting:
{
  fromId: 'user/bob'
  toId: 'user/charlie'
  amount: 100
  token: 'SHARE'
  description: 'user/bob gifts 100 shares to user/charlie'
}

txns for sending dividends:
{
  fromId: 'user/alice'
  toId: 'user/bob',
  amount: 250
  token: 'M$'
  description: 'user/alice distributes 250 M$ to user/bob'
}

txns for resolving/burning:
{
  fromId: 'user/alice'
  toId: 'BANK'
  amount: 250
  token: 'SHARE'
  description: 'user/alice burns 250 shares'
}
*/
//# sourceMappingURL=cert-txns.js.map
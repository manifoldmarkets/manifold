"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWeeklyPortfolioUpdateEmail = exports.sendNewUniqueBettorsEmail = exports.sendNewFollowedMarketEmail = exports.sendInterestingMarketsEmail = exports.sendNewAnswerEmail = exports.sendNewCommentEmail = exports.sendMarketCloseEmail = exports.sendThankYouEmail = exports.sendCreatorGuideEmail = exports.sendPersonalFollowupEmail = exports.sendWelcomeEmail = exports.sendMarketResolutionEmail = exports.emailMoneyFormat = void 0;
const constants_1 = require("../../common/envs/constants");
const calculate_1 = require("../../common/calculate");
const format_1 = require("../../common/util/format");
const calculate_dpm_1 = require("../../common/calculate-dpm");
const pseudo_numeric_1 = require("../../common/pseudo-numeric");
const send_email_1 = require("./send-email");
const utils_1 = require("./utils");
const contract_details_1 = require("../../common/contract-details");
const user_notification_preferences_1 = require("../../common/user-notification-preferences");
const emailMoneyFormat = (amount) => {
    return (0, format_1.formatMoney)(amount).replace(constants_1.ENV_CONFIG.moneyMoniker, 'M');
};
exports.emailMoneyFormat = emailMoneyFormat;
const sendMarketResolutionEmail = async (reason, privateUser, investment, payout, creator, creatorPayout, contract, resolution, resolutionProbability, resolutions) => {
    const { sendToEmail, unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
    if (!privateUser || !privateUser.email || !sendToEmail)
        return;
    const user = await (0, utils_1.getUser)(privateUser.id);
    if (!user)
        return;
    const outcome = toDisplayResolution(contract, resolution, resolutionProbability, resolutions);
    const subject = `Resolved ${outcome}: ${contract.question}`;
    const creatorPayoutText = creatorPayout >= 1 && privateUser.id === creator.id
        ? ` (plus ${(0, exports.emailMoneyFormat)(creatorPayout)} in commissions)`
        : '';
    const correctedInvestment = Number.isNaN(investment) || investment < 0 ? 0 : investment;
    const displayedInvestment = (0, exports.emailMoneyFormat)(correctedInvestment);
    const displayedPayout = (0, exports.emailMoneyFormat)(payout);
    const templateData = {
        userId: user.id,
        name: user.name,
        creatorName: creator.name,
        question: contract.question,
        outcome,
        investment: displayedInvestment,
        payout: displayedPayout + creatorPayoutText,
        url: `https://${constants_1.DOMAIN}/${creator.username}/${contract.slug}`,
        unsubscribeUrl,
    };
    // Modify template here:
    // https://app.mailgun.com/app/sending/domains/mg.manifold.markets/templates/edit/market-resolved/initial
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, subject, correctedInvestment === 0 ? 'market-resolved-no-bets' : 'market-resolved', templateData);
};
exports.sendMarketResolutionEmail = sendMarketResolutionEmail;
const toDisplayResolution = (contract, resolution, resolutionProbability, resolutions) => {
    var _a, _b;
    if (contract.outcomeType === 'CERT') {
        return resolution + ' (CERT)';
    }
    if (contract.outcomeType === 'BINARY') {
        const prob = resolutionProbability !== null && resolutionProbability !== void 0 ? resolutionProbability : (0, calculate_1.getProbability)(contract);
        const display = {
            YES: 'YES',
            NO: 'NO',
            CANCEL: 'N/A',
            MKT: (0, format_1.formatPercent)(prob !== null && prob !== void 0 ? prob : 0),
        }[resolution];
        return display || resolution;
    }
    if (contract.outcomeType === 'PSEUDO_NUMERIC') {
        const { resolution, resolutionValue } = contract;
        if (resolution === 'CANCEL')
            return 'N/A';
        return resolutionValue
            ? (0, format_1.formatLargeNumber)(resolutionValue)
            : (0, pseudo_numeric_1.formatNumericProbability)(resolutionProbability !== null && resolutionProbability !== void 0 ? resolutionProbability : (0, calculate_1.getProbability)(contract), contract);
    }
    if (resolution === 'MKT' && resolutions)
        return 'MULTI';
    if (resolution === 'CANCEL')
        return 'N/A';
    if (contract.outcomeType === 'NUMERIC' && contract.mechanism === 'dpm-2')
        return ((_b = (_a = contract.resolutionValue) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : (0, calculate_dpm_1.getValueFromBucket)(resolution, contract).toString());
    const answer = contract.answers.find((a) => a.id === resolution);
    if (answer)
        return answer.text;
    return `#${resolution}`;
};
const sendWelcomeEmail = async (user, privateUser) => {
    if (!privateUser || !privateUser.email)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const { unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'onboarding_flow');
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, 'Welcome to Manifold Markets!', 'welcome', {
        name: firstName,
        unsubscribeUrl,
    }, {
        from: 'David from Manifold <david@manifold.markets>',
    });
};
exports.sendWelcomeEmail = sendWelcomeEmail;
const sendPersonalFollowupEmail = async (user, privateUser, sendTime) => {
    if (!privateUser || !privateUser.email)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const emailBody = `Hi ${firstName},

Thanks for signing up! I'm one of the cofounders of Manifold Markets, and was wondering how you've found your experience on the platform so far?

If you haven't already, I encourage you to try creating your own prediction market (https://manifold.markets/create) and joining our Discord chat (https://discord.com/invite/eHQBNBqXuh).

Feel free to reply to this email with any questions or concerns you have.

Cheers,

James
Cofounder of Manifold Markets
https://manifold.markets
 `;
    await (0, send_email_1.sendTextEmail)(privateUser.email, 'How are you finding Manifold?', emailBody, {
        from: 'James from Manifold <james@manifold.markets>',
        'o:deliverytime': sendTime,
    });
};
exports.sendPersonalFollowupEmail = sendPersonalFollowupEmail;
const sendCreatorGuideEmail = async (user, privateUser, sendTime) => {
    if (!privateUser || !privateUser.email)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const { unsubscribeUrl, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'onboarding_flow');
    if (!sendToEmail)
        return;
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, 'Create your own prediction market', 'creating-market', {
        name: firstName,
        unsubscribeUrl,
    }, {
        from: 'David from Manifold <david@manifold.markets>',
        'o:deliverytime': sendTime,
    });
};
exports.sendCreatorGuideEmail = sendCreatorGuideEmail;
const sendThankYouEmail = async (user, privateUser) => {
    if (!privateUser || !privateUser.email)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const { unsubscribeUrl, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'thank_you_for_purchases');
    if (!sendToEmail)
        return;
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, 'Thanks for your Manifold purchase', 'thank-you', {
        name: firstName,
        unsubscribeUrl,
    }, {
        from: 'David from Manifold <david@manifold.markets>',
    });
};
exports.sendThankYouEmail = sendThankYouEmail;
const sendMarketCloseEmail = async (reason, user, privateUser, contract) => {
    if (!privateUser.email)
        return;
    const { username, name, id: userId } = user;
    const firstName = name.split(' ')[0];
    const { question, slug, volume } = contract;
    const url = `https://${constants_1.DOMAIN}/${username}/${slug}`;
    // We ignore if they were able to unsubscribe from market close emails, this is a necessary email
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, 'Your market has closed', 'market-close', {
        question,
        url,
        unsubscribeUrl: '',
        userId,
        name: firstName,
        volume: (0, exports.emailMoneyFormat)(volume),
    });
};
exports.sendMarketCloseEmail = sendMarketCloseEmail;
const sendNewCommentEmail = async (reason, privateUser, commentCreator, contract, commentText, commentId, bet, answerText, answerId) => {
    const { sendToEmail, unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
    if (!privateUser || !privateUser.email || !sendToEmail)
        return;
    const { question } = contract;
    const marketUrl = `https://${constants_1.DOMAIN}/${contract.creatorUsername}/${contract.slug}#${commentId}`;
    const { name: commentorName, avatarUrl: commentorAvatarUrl } = commentCreator;
    let betDescription = '';
    if (bet) {
        const { amount, sale } = bet;
        betDescription = `${sale || amount < 0 ? 'sold' : 'bought'} ${(0, exports.emailMoneyFormat)(Math.abs(amount))}`;
    }
    const subject = `Comment on ${question}`;
    const from = `${commentorName} on Manifold <no-reply@manifold.markets>`;
    if (contract.outcomeType === 'FREE_RESPONSE' && answerId && answerText) {
        const answerNumber = answerId ? `#${answerId}` : '';
        return await (0, send_email_1.sendTemplateEmail)(privateUser.email, subject, 'market-answer-comment', {
            answer: answerText,
            answerNumber,
            commentorName,
            commentorAvatarUrl: commentorAvatarUrl !== null && commentorAvatarUrl !== void 0 ? commentorAvatarUrl : '',
            comment: commentText,
            marketUrl,
            unsubscribeUrl,
            betDescription,
        }, { from });
    }
    else {
        if (bet) {
            betDescription = `${betDescription} of ${toDisplayResolution(contract, bet.outcome)}`;
        }
        return await (0, send_email_1.sendTemplateEmail)(privateUser.email, subject, 'market-comment', {
            commentorName,
            commentorAvatarUrl: commentorAvatarUrl !== null && commentorAvatarUrl !== void 0 ? commentorAvatarUrl : '',
            comment: commentText,
            marketUrl,
            unsubscribeUrl,
            betDescription,
        }, { from });
    }
};
exports.sendNewCommentEmail = sendNewCommentEmail;
const sendNewAnswerEmail = async (reason, privateUser, name, text, contract, avatarUrl) => {
    const { creatorId } = contract;
    // Don't send the creator's own answers.
    if (privateUser.id === creatorId)
        return;
    const { sendToEmail, unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
    if (!privateUser.email || !sendToEmail)
        return;
    const { question, creatorUsername, slug } = contract;
    const marketUrl = `https://${constants_1.DOMAIN}/${creatorUsername}/${slug}`;
    const subject = `New answer on ${question}`;
    const from = `${name} <info@manifold.markets>`;
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, subject, 'market-answer', {
        name,
        avatarUrl: avatarUrl !== null && avatarUrl !== void 0 ? avatarUrl : '',
        answer: text,
        marketUrl,
        unsubscribeUrl,
    }, { from });
};
exports.sendNewAnswerEmail = sendNewAnswerEmail;
const sendInterestingMarketsEmail = async (user, privateUser, contractsToSend, deliveryTime) => {
    if (!privateUser || !privateUser.email)
        return;
    const { unsubscribeUrl, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'trending_markets');
    if (!sendToEmail)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    await (0, send_email_1.sendTemplateEmail)(privateUser.email, `${contractsToSend[0].question} & 5 more interesting markets on Manifold`, 'interesting-markets', {
        name: firstName,
        unsubscribeUrl,
        question1Title: contractsToSend[0].question,
        question1Link: (0, utils_1.contractUrl)(contractsToSend[0]),
        question1ImgSrc: imageSourceUrl(contractsToSend[0]),
        question2Title: contractsToSend[1].question,
        question2Link: (0, utils_1.contractUrl)(contractsToSend[1]),
        question2ImgSrc: imageSourceUrl(contractsToSend[1]),
        question3Title: contractsToSend[2].question,
        question3Link: (0, utils_1.contractUrl)(contractsToSend[2]),
        question3ImgSrc: imageSourceUrl(contractsToSend[2]),
        question4Title: contractsToSend[3].question,
        question4Link: (0, utils_1.contractUrl)(contractsToSend[3]),
        question4ImgSrc: imageSourceUrl(contractsToSend[3]),
        question5Title: contractsToSend[4].question,
        question5Link: (0, utils_1.contractUrl)(contractsToSend[4]),
        question5ImgSrc: imageSourceUrl(contractsToSend[4]),
        question6Title: contractsToSend[5].question,
        question6Link: (0, utils_1.contractUrl)(contractsToSend[5]),
        question6ImgSrc: imageSourceUrl(contractsToSend[5]),
    }, deliveryTime ? { 'o:deliverytime': deliveryTime } : undefined);
};
exports.sendInterestingMarketsEmail = sendInterestingMarketsEmail;
function imageSourceUrl(contract) {
    return (0, contract_details_1.buildCardUrl)((0, contract_details_1.getOpenGraphProps)(contract));
}
const sendNewFollowedMarketEmail = async (reason, userId, privateUser, contract) => {
    const { sendToEmail, unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
    if (!privateUser.email || !sendToEmail)
        return;
    const user = await (0, utils_1.getUser)(privateUser.id);
    if (!user)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const creatorName = contract.creatorName;
    const questionImgSrc = imageSourceUrl(contract);
    console.log('questionImgSrc', questionImgSrc);
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, `${creatorName} asked ${contract.question}`, 'new-market-from-followed-user', {
        name: firstName,
        creatorName,
        unsubscribeUrl,
        questionTitle: contract.question,
        questionUrl: (0, utils_1.contractUrl)(contract),
        questionImgSrc,
    }, {
        from: `${creatorName} on Manifold <no-reply@manifold.markets>`,
    });
};
exports.sendNewFollowedMarketEmail = sendNewFollowedMarketEmail;
const sendNewUniqueBettorsEmail = async (reason, userId, privateUser, contract, totalPredictors, newPredictors, userBets, bonusAmount) => {
    const { sendToEmail, unsubscribeUrl } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, reason);
    if (!privateUser.email || !sendToEmail)
        return;
    const user = await (0, utils_1.getUser)(privateUser.id);
    if (!user)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const creatorName = contract.creatorName;
    // make the emails stack for the same contract
    const subject = `You made a popular market! ${contract.question.length > 50
        ? contract.question.slice(0, 50) + '...'
        : contract.question} just got ${newPredictors.length} new predictions. Check out who's predicting on it inside.`;
    const templateData = {
        name: firstName,
        creatorName,
        totalPredictors: totalPredictors.toString(),
        bonusString: (0, exports.emailMoneyFormat)(bonusAmount),
        marketTitle: contract.question,
        marketUrl: (0, utils_1.contractUrl)(contract),
        unsubscribeUrl,
        newPredictors: newPredictors.length.toString(),
    };
    newPredictors.forEach((p, i) => {
        templateData[`bettor${i + 1}Name`] = p.name;
        if (p.avatarUrl)
            templateData[`bettor${i + 1}AvatarUrl`] = p.avatarUrl;
        const bet = userBets[p.id][0];
        if (bet) {
            const { amount, sale } = bet;
            templateData[`bet${i + 1}Description`] = `${sale || amount < 0 ? 'sold' : 'bought'} ${(0, exports.emailMoneyFormat)(Math.abs(amount))}`;
        }
    });
    return await (0, send_email_1.sendTemplateEmail)(privateUser.email, subject, newPredictors.length === 1 ? 'new-unique-bettor' : 'new-unique-bettors', templateData, {
        from: `Manifold Markets <no-reply@manifold.markets>`,
    });
};
exports.sendNewUniqueBettorsEmail = sendNewUniqueBettorsEmail;
const sendWeeklyPortfolioUpdateEmail = async (user, privateUser, investments, overallPerformance, moversToSend) => {
    if (!privateUser || !privateUser.email)
        return;
    const { unsubscribeUrl, sendToEmail } = (0, user_notification_preferences_1.getNotificationDestinationsForUser)(privateUser, 'profit_loss_updates');
    if (!sendToEmail)
        return;
    const { name } = user;
    const firstName = name.split(' ')[0];
    const templateData = Object.assign({ name: firstName, unsubscribeUrl }, overallPerformance);
    for (let i = 0; i < moversToSend; i++) {
        const investment = investments[i];
        if (investment) {
            templateData[`question${i + 1}Title`] = investment.questionTitle;
            templateData[`question${i + 1}Url`] = investment.questionUrl;
            templateData[`question${i + 1}Prob`] = investment.questionProb;
            templateData[`question${i + 1}Change`] = (0, exports.emailMoneyFormat)(investment.profit);
            templateData[`question${i + 1}ChangeStyle`] = investment.profitStyle;
            templateData[`question${i + 1}Display`] = 'display: table-row';
        }
        else
            templateData[`question${i + 1}Display`] = 'display: none';
    }
    await (0, send_email_1.sendTemplateEmail)(privateUser.email, 
    // 'iansphilips@gmail.com',
    `Here's your weekly portfolio update!`, 'portfolio-update', templateData);
    (0, utils_1.log)('Sent portfolio update email to', privateUser.email);
};
exports.sendWeeklyPortfolioUpdateEmail = sendWeeklyPortfolioUpdateEmail;
//# sourceMappingURL=emails.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImagePrompt = exports.getCloseDate = exports.getGroupForMarket = void 0;
const dayjs = require("dayjs");
const admin = require("firebase-admin");
const openai_1 = require("openai");
const group_1 = require("../../../common/group");
const configuration = new openai_1.Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new openai_1.OpenAIApi(configuration);
const getGroupForMarket = async (question) => {
    var _a;
    const groups = await getGroups();
    const groupsList = groups.map((g) => g.name).join('\n');
    let response;
    try {
        response = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: `Categories:\n\n${groupsList}\n\nQuestion: ${question}\nSelected category:`,
            temperature: 0.4,
            max_tokens: 3,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
    }
    catch (e) {
        console.error('Error generating group for market. Do you have an OpenAI API key?', e.message);
        return undefined;
    }
    if (response.status !== 200)
        return undefined;
    const text = (_a = response.data.choices[0].text) === null || _a === void 0 ? void 0 : _a.trim();
    if (!text)
        return undefined;
    console.log('AI-selected group for question', question, ':', text);
    return groups.find((g) => g.name.toLowerCase().startsWith(text === null || text === void 0 ? void 0 : text.toLowerCase()));
};
exports.getGroupForMarket = getGroupForMarket;
const getCloseDate = async (question) => {
    var _a;
    const now = dayjs().format('M/D/YYYY h:mm a');
    let response;
    try {
        response = await openai.createCompletion({
            model: 'text-davinci-002',
            prompt: `Question: Will an AI-drawn movie have a rating >=7.0 on IMDB before 2025?\nNow: 5/2/2019 3:47 pm\nEnd date: 12/31/2025 11:59 pm\n\nQuestion: Will Bolsanaro concede the election by Nov 15?\nNow: 8/5/2022 1:20 pm\nEnd date: 11/14/2022 11:59 pm\n\nQuestion: Will Dwarf Fortress be released on Steam this year?\nNow: 2/5/2023 11:24 am\nEnd date: 12/31/2023 11:59 pm\n\nQuestion: Will eat ice cream today?\nNow: 10/2/2022 5:55 pm\nEnd date: 10/2/2022 11:59 pm\n\nQuestion: ${question}\nNow: ${now}\nEnd date:`,
            temperature: 0.4,
            max_tokens: 15,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
    }
    catch (e) {
        console.error('Error generating close date. Do you have an OpenAI API key?', e.message);
        return undefined;
    }
    if (response.status !== 200)
        return undefined;
    const text = (_a = response.data.choices[0].text) === null || _a === void 0 ? void 0 : _a.trim();
    if (!text)
        return undefined;
    console.log('AI-selected close date for question', question, ':', text);
    const timestamp = dayjs(text, 'M/D/YYYY h:mm a').valueOf();
    return !timestamp || !isFinite(timestamp) ? undefined : timestamp;
};
exports.getCloseDate = getCloseDate;
const getImagePrompt = async (question) => {
    let response;
    try {
        response = await openai.createCompletion({
            model: 'text-davinci-002',
            prompt: `The following are some examples of prompts for titles to be fed into the Dalle-2 image generation model:\n\n
      Title: "Will the new BART Transbay tube be completed by 2040"\n
      Prompt: “A futuristic looking train seen from above the water crossing the SF bay area, with a sunny sky and a view of the Bay area in the background".\n
      Title: "By 2040, will it be possible to take an electric VTOL aircraft on a trip of at least 75 miles for less than $100"\n
      Prompt: “An electric personal aircraft flying over a glowing, cyberpunk city skyline, with bright stars in the night sky"\n
      Title: "Will planned electricity shutdowns occur in France this winter?"\n
      Prompt: "A snowy scene with a person walking in a parisian city and the eiffel tower in the background"\n
      Title: "Will the United States' inflation rate be above 3% in 2023, 2024, and 2025?"\n
      Prompt: "The US dollar bill with the edges frayed and slightly burnt"\n
      Title: "Will proof emerge that the world is ruled by lizard people?"\n
      Prompt: "A council of lizard people in suits and ties, seated around a conference table with the world in the background"\n
      Title: "Will I live to be 200 years old?"\n
      Prompt: "An old and wise-looking person sitting in a cozy, futuristic house with glowing lights hovering around the scene."\n
      Title: "28. Will Twitter's net income be higher in 2023 than in 2022?"\n
      Prompt: "A flock of colorful twitter logos above a city skyline with dollar signs in the background."\n
      Please take the following title and create an image generator prompt that conveys a related concept:\n
      Title: ${question}\n
      Prompt:`,
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        });
    }
    catch (e) {
        console.error('Error generating image prompt. Do you have an OpenAI API key?', e.message);
        return undefined;
    }
    if (response.status !== 200)
        return undefined;
    const text = response.data.choices[0].text;
    if (!text)
        return undefined;
    console.log('AI-selected image prompt for question', question, ':', text);
    return text;
};
exports.getImagePrompt = getImagePrompt;
const firestore = admin.firestore();
const getGroups = async () => {
    const snap = await firestore
        .collection('groups')
        .where('anyoneCanJoin', '==', true)
        .get();
    const groups = snap.docs.map((d) => d.data());
    return (0, group_1.filterTopGroups)(groups, 100, false);
};
//# sourceMappingURL=openai-utils.js.map
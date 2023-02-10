"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeEA = void 0;
// Run with `npx ts-node src/scripts/contest/scrape-ea.ts`
const fs = require("fs");
const puppeteer = require("puppeteer");
function scrapeEA(contestLink, fileName) {
    ;
    (async () => {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(contestLink);
        let loadMoreButton = await page.$('.LoadMore-root');
        while (loadMoreButton) {
            await loadMoreButton.click();
            await page.waitForNetworkIdle();
            loadMoreButton = await page.$('.LoadMore-root');
        }
        /* Run javascript inside the page */
        const data = await page.evaluate(() => {
            var _a, _b, _c;
            const list = [];
            const items = document.querySelectorAll('.PostsItem2-root');
            for (const item of items) {
                const link = 'https://forum.effectivealtruism.org' +
                    ((_a = item === null || item === void 0 ? void 0 : item.querySelector('a')) === null || _a === void 0 ? void 0 : _a.getAttribute('href'));
                // Replace '&amp;' with '&'
                const clean = (str) => str === null || str === void 0 ? void 0 : str.replace(/&amp;/g, '&');
                list.push({
                    title: clean((_b = item === null || item === void 0 ? void 0 : item.querySelector('a>span>span')) === null || _b === void 0 ? void 0 : _b.innerHTML),
                    author: (_c = item === null || item === void 0 ? void 0 : item.querySelector('a.UsersNameDisplay-userName')) === null || _c === void 0 ? void 0 : _c.innerHTML,
                    link: link,
                });
            }
            return list;
        });
        fs.writeFileSync(`./src/scripts/contest/${fileName}.ts`, `export const data = ${JSON.stringify(data, null, 2)}`);
        console.log(data);
        await browser.close();
    })();
}
exports.scrapeEA = scrapeEA;
scrapeEA('https://forum.effectivealtruism.org/topics/criticism-and-red-teaming-contest', 'criticism-and-red-teaming');
//# sourceMappingURL=scrape-ea.js.map
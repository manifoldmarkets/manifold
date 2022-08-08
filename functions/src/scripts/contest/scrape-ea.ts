// Run with `npx ts-node src/scripts/contest/scrape-ea.ts`
import * as fs from 'fs'
import * as puppeteer from 'puppeteer'
import { CONTEST_DATA } from 'common/contest'

export function scrapeEA(contestLink: string, fileName: string) {
  ;(async () => {
    const browser = await puppeteer.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(contestLink)

    let loadMoreButton = await page.$('.LoadMore-root')

    while (loadMoreButton) {
      await loadMoreButton.click()
      await page.waitForNetworkIdle()
      loadMoreButton = await page.$('.LoadMore-root')
    }

    /* Run javascript inside the page */
    const data = await page.evaluate(() => {
      const list = []
      const items = document.querySelectorAll('.PostsItem2-root')

      for (const item of items) {
        let link =
          'https://forum.effectivealtruism.org' +
          item?.querySelector('a')?.getAttribute('href')

        list.push({
          title: item?.querySelector('a>span>span')?.innerHTML,
          author: item?.querySelector('a.UsersNameDisplay-userName')?.innerHTML,
          link: link,
        })
      }

      return list
    })

    fs.writeFileSync(
      '../web/lib/util/contests/' + fileName + '.json',
      JSON.stringify(data, null, 2)
    )

    console.log(data)
    await browser.close()
  })()
}

// runs using data from CONTEST_DATA
scrapeEA(
  CONTEST_DATA['cause-exploration-prize'].submissionLink,
  CONTEST_DATA['cause-exploration-prize'].fileName
)

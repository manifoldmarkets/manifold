// Run with `npx ts-node src/scripts/scrape-ftx.ts`

import * as cheerio from 'cheerio'
import * as fs from 'fs'

type FtxGrant = {
  title: string
  description: string
  date: string
  amount: string
  // Joint string separated with '|', eg 'Great Power Relations|Space Governance'
  areasOfInterest: string
  link?: string
}

function elToFtxGrant($: cheerio.Root, el: cheerio.Element): FtxGrant {
  const $el = $(el)
  const title = $el.find('h2.grant-card__title').text().trim()
  const description = $el.find('.grant-card__description').text().trim()
  const date = $el.find('.grant-card__date').text().trim()
  const amount = $el.find('.grant-card__amount').text().trim()
  const areasOfInterest = $el
    .find('.area-of-interest__title')
    // Remove all leading and trailing whitespace
    .map((_, el) => $(el).text().trim())
    .get()
    .join('|')
  const link = $el.find('a.grant-card__link').attr('href')?.trim()

  return {
    title,
    description,
    date,
    amount,
    areasOfInterest,
    link,
  } as FtxGrant
}

async function scrapeFtx() {
  const resp = await fetch('https://ftxfuturefund.org/all-grants/#grants')
  const text = await resp.text()
  const $ = cheerio.load(text)
  const strip = (text: string) => text.replace(/'/g, '')
  const toNum = (text: string) => Number(text.replace(/[^0-9.-]+/g, ''))

  // Parse Grant objects from each <div class="grant-card"> using cheerio
  const csvLines = [
    // Add a header row
    // 'title\tdescription\tdate\tamount\tareasOfInterest\tlink',
    ...$('div.grant-card')
      .map((_, el) => elToFtxGrant($, el))
      .get()
      .map(
        (grant) =>
          // Join all attributes with tabs
          `{ from: 'FTX FF', to: '${
            grant.title
          }', date: '2022-07-27', amount: ${toNum(
            grant.amount
          )}, description: '${strip(grant.description)}' },`
      ),
  ]
  fs.writeFileSync('ftx-grants.csv', csvLines.join('\n'))
}

if (require.main === module) {
  scrapeFtx().then(() => process.exit())
}

/*
Example html grant card, for reference:
<div class="grant-card" style="order: -1">
  <div class="grant-card__date">
    March 2022                                        
  </div>
  <h2 class="grant-card__title">
    Manifold Markets                                    
  </h2>
  <div class="grant-card__description">
    <p>​​This regrant will support Manifold Markets in building a play-money prediction market platform. The platform is also experimenting with impact certificates and charity prediction markets.</p>
  </div>
  <div class="grant-card__amount">
    $1,000,000                                        
  </div>
  <a href="https://manifold.markets/" class="grant-card__link">
  manifold.markets                                            </a>
  <div class="grant-card__areas-of-interest">
    <a href="https://ftx.tghp.co.uk/area-of-interest/#institution-epistemic-institutions" class="area-of-interest">
      <div class="area-of-interest__icon">
        <!--?xml version="1.0" encoding="utf-8"?-->
        <!-- Generator: Adobe Illustrator 25.3.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
        <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve">
          <style type="text/css">
            .st0{fill:#EF3C27;}
          </style>
          <g>
            <path class="st0" d="M491.8,307.6c5.9-6.6,9.6-15.4,9.6-24.9c0-16.9-11.3-31.2-26.7-35.8V85.4h5.2c5.9,0,10.7-4.8,10.8-10.7v-64
              C490.7,4.8,485.9,0,480,0H32.1c-5.9,0-10.7,4.8-10.7,10.7v64c0,5.9,4.8,10.7,10.7,10.7h64v30.6c-0.1,0.5-0.1,0.9-0.1,1.4
              c0,0.5,0,1,0.1,1.4v94.5c0,5,3.5,9.4,8.4,10.5l149.2,32c0.8,0.1,1.5,0.2,2.3,0.2s1.5-0.1,2.4-0.2l149.3-32
              c4.9-1.1,8.4-5.4,8.4-10.5V85.4h37.2v161.5c-15.4,4.6-26.7,18.9-26.7,35.8c0,9.6,3.6,18.3,9.6,24.9c-12.2,8.7-20.2,23-20.2,39.1
              v90.6c0,5.9,4.8,10.7,10.7,10.7h74.6c5.9,0,10.7-4.8,10.8-10.7v-90.6C512,330.6,504,316.3,491.8,307.6z M42.8,21.3h426.5V64h-63.9
              H106.8h-64V21.3z M256,234.4l-138.6-29.7v-76.7h277.2v76.7L256,234.4z M394.6,106.7H117.4V85.4h277.2V106.7z M448,282.7
              c0-8.8,7.2-16,16-16c8.8,0,15.9,7.2,16,16c0,8.8-7.2,16-16,16C455.2,298.7,448,291.5,448,282.7z M490.7,426.6h-53.4v-79.9
              c0-14.7,12-26.7,26.7-26.7c14.7,0,26.7,12,26.7,26.7V426.6z"></path>
            <path class="st0" d="M351.9,447.9h-21.3c-5.9,0-10.7,4.8-10.7,10.7s4.8,10.7,10.7,10.7h21.3c5.9,0,10.7,4.8,10.7,10.7
              c0,5.9-4.8,10.7-10.7,10.7h-74.6l-13-52.3c-0.5-1.9-1.4-3.5-2.8-4.9L72.9,244.9c-16.7-16.7-43.7-16.7-60.3,0
              C4.6,253,0.1,263.6,0.1,275.1s4.5,22.1,12.5,30.2L201,493.7c1.4,1.4,3.2,2.4,5,2.8l59.6,14.8c1,0.3,2.1,0.5,3.3,0.5h83.1
              c17.6,0,32-14.4,32-32C383.9,462.2,369.6,447.9,351.9,447.9z M65.4,327.8l30.1-30.1l15.1,15.1l-30.1,30.1L65.4,327.8z M21.4,275
              c0-5.7,2.2-11,6.2-15c8.3-8.3,21.9-8.3,30.2,0l22.7,22.7l-30.1,30.1L27.6,290C23.6,285.9,21.4,280.6,21.4,275z M214.1,476.5
              L95.6,357.9l30.1-30.1l118.5,118.5l10,40.2L214.1,476.5z"></path>
          </g>
        </svg>
      </div>
      <div class="area-of-interest__title">
        Epistemic Institutions                                                        
      </div>
    </a>
  </div>
</div>
*/

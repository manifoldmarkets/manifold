// Run with `npx ts-node src/scripts/scrape-sff.ts`

import * as cheerio from 'cheerio'
import * as fs from 'fs'

type SffGrant = {
  round: string
  source: string
  organization: string
  amount: string
  receivingCharity: string
  purpose: string
}

/*
Example tr for a SffGrant:
<tr>
  <td style="text-align: left">SFF-2019-Q3</td>
  <td style="text-align: left">SFF DAF</td>
  <td style="text-align: left">80,000 Hours</td>
  <td style="text-align: left">$280,000</td>
  <td style="text-align: left">Centre for Effective Altruism, USA</td>
  <td style="text-align: left">General Support</td>
</tr>
*/
function trToSffGrant($: cheerio.Root, el: cheerio.Element): SffGrant {
  const $el = $(el)
  const round = $el.find('td').eq(0).text().trim()
  const source = $el.find('td').eq(1).text().trim()
  const organization = $el.find('td').eq(2).text().trim()
  const amount = $el.find('td').eq(3).text().trim()
  const receivingCharity = $el.find('td').eq(4).text().trim()
  const purpose = $el.find('td').eq(5).text().trim()

  return {
    // TODO: Map rounds to dates
    round,
    source,
    organization,
    amount,
    receivingCharity,
    purpose,
  } as SffGrant
}

async function scrapeSff() {
  const resp = await fetch('http://survivalandflourishing.fund/')
  const text = await resp.text()
  const $ = cheerio.load(text)
  // Parse SffGrants from the <tr> using cheerio
  const grants = $('tr')
    .map((_, el) => trToSffGrant($, el))
    .get()
  const csvLines = [
    // Header row
    'round\tsource\torganization\tamount\treceivingCharity\tpurpose',
    ...grants.map((grant) =>
      // Join all attributes with tabs, to avoid comma issues
      Object.values(grant).join('\t')
    ),
  ]
  fs.writeFileSync('sff-grants.csv', csvLines.join('\n'))
}

if (require.main === module) {
  scrapeSff().then(() => process.exit())
}

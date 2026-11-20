// Links the props and lines the community made on 2026 Senate, Governor and
// House races to each race's market, so the race card on /election lists them
// under "Linked markets" (common/src/market-links.ts). The list below was
// reviewed by hand and approved by @Jack1: real props and lines only, never
// the race question again or its opposite, and never a market that is itself
// a parent. A House district priced by a shared portfolio answer has no market
// of its own, so its props are not here; give it a district market first.
//
// Dry run (prints the list grouped by race, checks every link, writes nothing):
//   cd backend/scripts && npx ts-node link-election-race-markets.ts
// Apply, recording the links as made by @Jack1 unless --as says otherwise:
//   npx ts-node link-election-race-markets.ts --apply [--as <userId>] [--replace]
//
// The same checks as the link-market API, inside one transaction per link
// with the same locks: the parent is public, open and not itself linked; the
// child is public and has nothing linked to it. A child already linked to
// another market is left alone unless --replace.

import { groupBy, keyBy, uniq } from 'lodash'
import {
  getLinkChildError,
  getLinkParentError,
  MarketLinkRelation,
} from 'common/market-links'
import { tsToMillis } from 'common/supabase/utils'
import { runScript } from 'run-script'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  getLinkedChildCount,
  getLinkParentCandidate,
  getMarketLinkParent,
  lockMarketLinkContracts,
  upsertMarketLink,
} from 'shared/supabase/market-links'

type RaceLink = {
  /** The race as the map labels it: "Senate · TX", "House · KY-4". */
  race: string
  /** The race's market on the map (web/public/data/*-data.ts). */
  parent: string
  child: string
  relation: MarketLinkRelation
  note?: string
}

// @Jack1 reviewed the list, so the links are recorded as his unless --as.
const JACK1_ID = 'j3qXHWAZS4b37tlcY3u22l1D1qF3'

export const ELECTION_RACE_LINKS: RaceLink[] = [
  // Senate · TX — Which party will win the 2026 Texas Senate race?
  // Winning Margin in 2026 Texas Senate Election? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'Py669dSEsy',
    relation: 'line',
  },
  // Texas Senate Winner by Margin of Libertarian Candidate Vote Count (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'SR8Qzhz9E5',
    relation: 'line',
  },
  // Will the Libertarian candidate in the 2026 US Senate Election in Texas get 1% or more of t (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'pI9lgQUCyh',
    relation: 'line',
  },
  // Will the Libertarian candidate in the 2026 US Senate Election in Texas get 2% or more of t (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'hzt5C5SlhZ',
    relation: 'line',
  },
  // Will any candidate get 50.000% or more of the vote in the 2026 Senate election In Texas? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'uS6y0zE5nI',
    relation: 'prop',
  },
  // Who will be favourite on election day to win the Texas senate election? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'Igqtu8Qct8',
    relation: 'prop',
  },
  // Will James Talarico win Starr County by 7.000% or more in the 2026 Texas Senate election? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'dlOC0n6qpd',
    relation: 'prop',
  },
  // Will James Talarico win Starr County in the 2026 Texas Senate election? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'PPE9OCyqtt',
    relation: 'prop',
  },
  // Will James Talarico win Tarrant County by 7.000% or more in the 2026 Texas Senate election (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'AslU6uq0Rz',
    relation: 'prop',
  },
  // Will Ken Paxton get 40% or more of the Asian vote in the 2026 senate election, according t (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'nQL8gE5EZL',
    relation: 'prop',
  },
  // Will Talarico outperform Beto O'Rourke in the 2026 US Senate Election in Texas? (@BayesianTom)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'u25Zczln9Z',
    relation: 'prop',
  },
  // If James Talarico wins the Texas Senate election, will democrats win another statewide off (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'uUl9NqnQzg',
    relation: 'related',
  },
  // Will James Talarico appear on Joe Rogan before the election? (@Jack1)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'L2yOcgEU2A',
    relation: 'related',
  },
  // Which of the following things happen in relation to the Texas Senate Election in 2026? (@GuyCohen)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'ZIuPyZsLO2',
    relation: 'related',
  },
  // If James Talarico is elected, will he serve a full 6 year term? (@ManifoldPolitics)
  {
    race: 'Senate · TX',
    parent: 'tdA9NqRnpZ',
    child: 'gOs5AAIgN0',
    relation: 'related',
    note: 'closes 2033; conditional on the winner',
  },
  // Senate · MI — Which party will win the 2026 Michigan Senate race?
  // Abdul El Sayed Winning margin in 2026 Michigan Senate election? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: '26lct0PyOE',
    relation: 'line',
  },
  // Will Abdul El Sayed win the 2026 Michigan Election by 3% or more? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'AnP5hddcLL',
    relation: 'line',
  },
  // Will Abdul El Sayed win the 2026 Michigan Election by 5% or more? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'gzU0thApPR',
    relation: 'line',
  },
  // Will Abdul El Sayeds winning margin be greater than Jocelyn Bensons? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'nIP0598qlN',
    relation: 'prop',
  },
  // If this person is the Democratic Nominee for Michigan Senate, will they win? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'nRqIst6tgz',
    relation: 'related',
  },
  // If elected, will Abdul El-Sayed serve on the Senate Foreign Relations committee? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'pUR0gOCOIt',
    relation: 'related',
  },
  // Will Zohran Mamdani officially endorse or campaign for Abdul El Sayed for senate? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'Pp06nN2Zpy',
    relation: 'related',
  },
  // Will Hasan Piker go to Michigan before Election Day? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'UPOhQ8qpq6',
    relation: 'related',
  },
  // Will Mike Rogers be seen with Donald Trump before election day? (@Jack1)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'UsRcgZIlqq',
    relation: 'related',
  },
  // If Abdul El-Sayed is elected, will he serve a full 6 year term? (@ManifoldPolitics)
  {
    race: 'Senate · MI',
    parent: 'Ad6z6OsuQ5',
    child: 'NLCcEllq5q',
    relation: 'related',
    note: 'closes 2033; conditional on the winner',
  },
  // Senate · ME — Will the Democratic Party Candidate win the 2026 Maine Senate Election?
  // Maine Senate margin of victory in ME-2? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'gn2LL2qhtq',
    relation: 'line',
  },
  // Will Troy Jackson get 50% or more in the first round of the Maine senate election? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'c2dPdlnp9L',
    relation: 'line',
  },
  // Will Angus King endorse Troy Jackson in the 2026 Maine Senate election? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'Z2Azh52QP6',
    relation: 'related',
  },
  // Will Donald Trump go to Maine before election day? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'syNusuy2dz',
    relation: 'related',
  },
  // Will Susan Collins be seen with Donald Trump before election day? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'qIU0luEISq',
    relation: 'related',
  },
  // Will Tucker Carlson and Graham Platner meet before election day? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'z8PERIuEnl',
    relation: 'related',
  },
  // Who will John Fetterman endorse or suggest voting for in the Maine senate election? (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'QS5U50uSpR',
    relation: 'related',
  },
  // IF Troy Jackson is the Maine senate nominee for democrats, will Joe Biden endorse or campa (@Jack1)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'gu2PquCcPA',
    relation: 'related',
  },
  // If this person is the Democratic Senate candidate for Maine, will they win the 2026 electi (@Tetraspace)
  {
    race: 'Senate · ME',
    parent: 'RcL0Q9O0EU',
    child: 'ZI29Oy5URc',
    relation: 'related',
  },
  // Senate · GA — Which party will win the 2026 US Senate election in Georgia?
  // Jon Ossoff wins the 2026 Georgia Senate election by 8.00% or more? (@Jack1)
  {
    race: 'Senate · GA',
    parent: 'cOqt565CRZ',
    child: '95IpPZ5t8S',
    relation: 'line',
  },
  // Will Jon Ossoff win Fayette County in the 2026 Georgia Senate Election? (@Jack1)
  {
    race: 'Senate · GA',
    parent: 'cOqt565CRZ',
    child: 'zOppEs8hRz',
    relation: 'prop',
  },
  // Will Jon Ossoff win Houston County in the 2026 Georgia Senate Election? (@Jack1)
  {
    race: 'Senate · GA',
    parent: 'cOqt565CRZ',
    child: 'Ic8N2c0EcP',
    relation: 'prop',
  },
  // Will the 2026 Georgia Senate race go to a runoff? (@PlasmaBallin)
  {
    race: 'Senate · GA',
    parent: 'cOqt565CRZ',
    child: 'r4nNoJUSNDSP0oE9f2me',
    relation: 'prop',
  },
  // If Jon Ossoff is reelected, will he serve a full 6 year term? (@ManifoldPolitics)
  {
    race: 'Senate · GA',
    parent: 'cOqt565CRZ',
    child: 'lZtNE6z6h5',
    relation: 'related',
    note: 'closes 2033; conditional on the winner',
  },
  // Senate · NC — Which Party will win the 2026 North Carolina senate election?
  // Will Roy Cooper win any congressional district a Democratic House candidate loses? (@Jack1)
  {
    race: 'Senate · NC',
    parent: '9EALhuO9dp',
    child: 'RItqR268nZ',
    relation: 'prop',
  },
  // Will the 2026 Senate Race in North Carolina be the most expensive senate race of the entir (@AutopoieticErgodicity)
  {
    race: 'Senate · NC',
    parent: '9EALhuO9dp',
    child: 'RpSRt0LZRE',
    relation: 'prop',
  },
  // Senate · SC — Which party will win the 2026 South Carolina Senate race?
  // Darline Graham Vote Percent in South Carolina Senate election (@Jack1)
  {
    race: 'Senate · SC',
    parent: 'LsEpnppAcc',
    child: 'US0IUltOUy',
    relation: 'line',
  },
  // Will Darline Graham get 50.000% or more of the vote in the 2026 Senate election in South C (@Jack1)
  {
    race: 'Senate · SC',
    parent: 'LsEpnppAcc',
    child: 'dsSUI5LPOA',
    relation: 'line',
  },
  // Will Annie Andrews perform better than Jaime Harrison did in 2020, in the 2026 US Senate e (@Jack1)
  {
    race: 'Senate · SC',
    parent: 'LsEpnppAcc',
    child: 'Cc9qPANQI6',
    relation: 'prop',
  },
  // If this person is the Republican nominee for the 2026 South Carolina senate election, will (@Tetraspace)
  {
    race: 'Senate · SC',
    parent: 'LsEpnppAcc',
    child: 'tzs5zgCZc2',
    relation: 'related',
  },
  // Senate · KS — Which party will win the 2026 Kansas Senate race?
  // Will Roger Marshall win the Kansas senate election by 11% or more? (@Jack1)
  {
    race: 'Senate · KS',
    parent: 'nZsucEQ8gQ',
    child: 'lQs2sq6u68',
    relation: 'line',
  },
  // Adam Hamiltons winning margin in Johnson County in the 2026 Kansas Senate election? (@Jack1)
  {
    race: 'Senate · KS',
    parent: 'nZsucEQ8gQ',
    child: '6dAOqL5RUZ',
    relation: 'line',
  },
  // Senate · MT — Who will win the 2026 Montana senate election?
  // Will Kurt Alme get 50.000% or more of the vote in the 2026 senate election in Montana? (@Jack1)
  {
    race: 'Senate · MT',
    parent: 'tydQt5d26u',
    child: 'IyAgyP2g0y',
    relation: 'line',
  },
  // Senate · NH — Which Party will win the 2026 New Hampshire Senate Election
  // Will Democrat Chris Pappas win New Hampshire Senate election by 10% or more? (@Jack1)
  {
    race: 'Senate · NH',
    parent: 'lRd6Sz0dC8',
    child: '9Np0qtzytp',
    relation: 'line',
  },
  // Will John Sununu be seen with Donald Trump before election day? (@Jack1)
  {
    race: 'Senate · NH',
    parent: 'lRd6Sz0dC8',
    child: 'pRNLnLdgyR',
    relation: 'related',
  },
  // Senate · MN — Which Party will win the 2026 Senate Election in Minnesota
  // Will Democrat Peggy Flanagan win Minnesota Senate election by 10% or more? (@Jack1)
  {
    race: 'Senate · MN',
    parent: 'QcRNIRZSNg',
    child: 'QURLI06h2d',
    relation: 'line',
  },
  // Senate · AK — Which party will win the 2026 Alaska Senate race?
  // Mary Peltola vote percent in first round of Alaskan Senate general election? (@Jack1)
  {
    race: 'Senate · AK',
    parent: '0L8uQURR06',
    child: 'EUtsIpA0Zl',
    relation: 'line',
  },
  // Will Impostor Dan Sullivan finish third in the Alaska Senate election? (@Jack1)
  {
    race: 'Senate · AK',
    parent: '0L8uQURR06',
    child: 'uP5ZLAIENg',
    relation: 'prop',
  },
  // In the 2026 Alaska Senate election, will any of these outlets call the winner within 24 ho (@Jack1)
  {
    race: 'Senate · AK',
    parent: '0L8uQURR06',
    child: 'zIgZynLCpL',
    relation: 'prop',
  },
  // Senate · OH (special) — What party will win the special election to fill JD Vance's Senate seat?
  // Will Sherrod Brown be sworn in to the Senate, on or before December 18 2026? (@Jack1)
  {
    race: 'Senate · OH (special)',
    parent: 'Eg96Z2066n',
    child: 'CAqdc6E8gh',
    relation: 'prop',
  },
  // Ohio 2026 Governor + Senate Bets (@Jack1)
  {
    race: 'Senate · OH (special)',
    parent: 'Eg96Z2066n',
    child: 'lgtZ2EsChq',
    relation: 'related',
    note: 'covers both Ohio races; one parent only',
  },
  // Will Ohio elect a Democratic Senator in 2026, and will they elect at least 4 Democratic Re (@EvanDaniel)
  {
    race: 'Senate · OH (special)',
    parent: 'Eg96Z2066n',
    child: 'UQtnAQ8OzI',
    relation: 'related',
  },
  // Senate · FL (special) — Will a Republican win the US Senate special election in Florida in 2026?
  // Will Democrat Angie Nixon win Miami Dade County in the Florida Senate Election? (@Jack1)
  {
    race: 'Senate · FL (special)',
    parent: 'CcysACRQAh',
    child: 'QC80ENZPh5',
    relation: 'prop',
  },
  // What will be the margin in the Florida Senate race in 2026? (@EnopoletusHarding)
  {
    race: 'Senate · FL (special)',
    parent: 'CcysACRQAh',
    child: '8PZIUl5lI9',
    relation: 'line',
  },
  // Senate · KY — Which party will win the Kentucky Senate Seat in 2026?
  // If Mitch McConnell vacates his senate seat before the term ends, will Andy Beshear appoint (@Jack1)
  {
    race: 'Senate · KY',
    parent: 'LnRZCqd2Ig',
    child: 'zNpp5nS2n8',
    relation: 'related',
  },
  // Will Mitch McConnell complete his current term as Senator from Kentucky? (@vgnsh)
  {
    race: 'Senate · KY',
    parent: 'LnRZCqd2Ig',
    child: 'jXtkHkERT7d0JdKUPHV3',
    relation: 'related',
  },
  // Senate · NE — Which party will win the 2026 Nebraska Senate race?
  // How will the Nebraska 2026 Senate winner caucus? (@EvanDaniel)
  {
    race: 'Senate · NE',
    parent: '6I5SSguQ8I',
    child: 'Iyy2qZA98U',
    relation: 'prop',
  },
  // What % of the vote will Dan Osborn receive in the 2026 Nebraska Senate election? (@thepurplebull)
  {
    race: 'Senate · NE',
    parent: '6I5SSguQ8I',
    child: 'L89p8qAg2y',
    relation: 'line',
  },
  // Senate · IA — Who will win the 2026 United States Senate election in Iowa?
  // If Josh Turek is the Democratic nominee, will he win the Iowa Senate race in 2026? (@bens)
  {
    race: 'Senate · IA',
    parent: 'I9QNz9Q2L2',
    child: '6ZPu0O0S6R',
    relation: 'related',
  },
  // Governor · TX — Texas Governor's Race: Which party will win in 2026?
  // Republicans win Texas governor by 6+ points? (@Jack1)
  {
    race: 'Governor · TX',
    parent: 'OZv5O8iPqPQhdavqQOSQ',
    child: 'qgluPSESQd',
    relation: 'line',
  },
  // Governor · WI — Which Party will win the 2026 Wisconsin gubernatorial election?
  // Will Democrats win the 2026 Wisconsin Gubernatorial election by 5.00% or more? (@Jack1)
  {
    race: 'Governor · WI',
    parent: 'qScqn2tS8Q',
    child: 'EttIsglNlL',
    relation: 'line',
  },
  // If this person is the Democratic primary nominee for Wisconsin governor in 2026, will they (@Tetraspace)
  {
    race: 'Governor · WI',
    parent: 'qScqn2tS8Q',
    child: 'pu5gq8nC6c',
    relation: 'related',
  },
  // Governor · MN — Democrats win 2026 Minnesota gubernatorial election?
  // Will Tim Walz Finish his term as Governor of Minnesota? (@HillaryClinton)
  {
    race: 'Governor · MN',
    parent: 'LNPL28tA80',
    child: 'QtcdCA5Nuu',
    relation: 'related',
  },
  // Governor · PA — Which Party will win the 2026 Pennsylvania Gubernatorial election?
  // Will Josh Shapiro get 60.00% or more of the vote in 2026 Pennsylvania Governor election? (@Jack1)
  {
    race: 'Governor · PA',
    parent: 'QcPEg95OS6',
    child: 's9t8IlQOEc',
    relation: 'line',
  },
  // Governor · MD — Which Party will win the 2026 Maryland Gubernatorial Election?
  // Will Wes Moore win the 2026 Maryland Governors election by 34.000% or more? (@Jack1)
  {
    race: 'Governor · MD',
    parent: 'yqOnLgpc6C',
    child: 'L9EALdgspO',
    relation: 'line',
  },
  // Governor · OH — 2026 Ohio Governor election winner?
  // Will Amy Acton outperform Sherrod Brown in 2026? (@ManifoldPolitics)
  {
    race: 'Governor · OH',
    parent: 'tyqgQCS0zd',
    child: 'z206np6LCy',
    relation: 'prop',
  },
  // Governor · AK — Which Party will win the Alaska Governors race in 2026?
  // How many candidates get 10% or more in the first round of the Alaska Governors Election? (@Jack1)
  {
    race: 'Governor · AK',
    parent: 'UEnlNUy92z',
    child: 'gC9tpC9Q2Q',
    relation: 'prop',
  },
  // Governor · CA — California Governor's Race: Which party will win in 2026?
  // Will Xavier Becerra OR Tom Steyer win the 2026 California Governor election? (@Jack1)
  {
    race: 'Governor · CA',
    parent: 'pRsyVoO38fHU2psY5PBf',
    child: 'LSlUz6Rut6',
    relation: 'prop',
  },
  // Will Kamala Harris be elected governor of California in 2026? (@PlasmaBallin)
  {
    race: 'Governor · CA',
    parent: 'pRsyVoO38fHU2psY5PBf',
    child: 'S0Nhz5S5Sg',
    relation: 'prop',
  },
  // Will Betty Yee be elected California Governor in 2026 (@jtd)
  {
    race: 'Governor · CA',
    parent: 'pRsyVoO38fHU2psY5PBf',
    child: '60mfNct7BetemzImychh',
    relation: 'prop',
  },
  // Will Eric Swalwell be elected the next Governor of California? (@ManiPart)
  {
    race: 'Governor · CA',
    parent: 'pRsyVoO38fHU2psY5PBf',
    child: 'AnE5Zt5QlC',
    relation: 'prop',
  },
  // If This CA Gov candidate makes the runoff, will they win the California Governor election? (@Jack1)
  {
    race: 'Governor · CA',
    parent: 'pRsyVoO38fHU2psY5PBf',
    child: 'hsUns58P28',
    relation: 'related',
  },
  // Governor · NY — New York Governor's Race: Which party will win in 2026?
  // What will be the margin in the 2026 New York Gubernatorial election? (@EnopoletusHarding)
  {
    race: 'Governor · NY',
    parent: '5ElGq01XrCeDtPRsFjUM',
    child: 'hcAz2tEPLt',
    relation: 'line',
  },
  // Will Ritchie Torres be the next governor of New York? (@LeeBressler)
  {
    race: 'Governor · NY',
    parent: '5ElGq01XrCeDtPRsFjUM',
    child: 'NP9CqulZcA',
    relation: 'prop',
  },
  // Governor · MA — Massachusetts Governor's Race: Which party will win in 2026?
  // By how much will the Democrats beat the GOP in the 2026 Massachusetts Governor's Race? (@JimD)
  {
    race: 'Governor · MA',
    parent: 'Hvlx213sUvoKxeP9do21',
    child: 'zLRcPUZPRO',
    relation: 'line',
  },
  // Governor · FL — Will a Republican win the Florida governorship in 2026?
  // Will Ron DeSantis complete his term as governor of Florida? (@MachiNi)
  {
    race: 'Governor · FL',
    parent: 'uODgxBgIoHZWqFqHGPbe',
    child: 'yF32jdrAMn8qVCz3nJoA',
    relation: 'related',
  },
  // Byron Donalds is GOP nominee for Florida governor? (@DavidFWatson)
  {
    race: 'Governor · FL',
    parent: 'uODgxBgIoHZWqFqHGPbe',
    child: 'PON6RLpSSz',
    relation: 'related',
  },
  // Governor · OR — 2026 Oregon Governor election winner?
  // Robert Neuman is running for governor of Oregon. Will his name be misspelled at least once (@RNe)
  {
    race: 'Governor · OR',
    parent: 'InE0tLCOC0',
    child: 'cqcqIRhc5P',
    relation: 'prop',
  },
  // Will Oregon Governor Tina Kotek complete the four year term of office? (@RNe)
  {
    race: 'Governor · OR',
    parent: 'InE0tLCOC0',
    child: 'KtLTlRTDohZsyggCjP6C',
    relation: 'related',
  },
  // House · KY-4 — Which party will win the 2026 U.S. House election in Kentucky's 4th District?
  // Will the libertarian candidate in Kentucky 4th, Massies district, get 5.000% of the vote o (@Jack1)
  {
    race: 'House · KY-4',
    parent: '8pScpgsc9O',
    child: 'NIp8RCEzyO',
    relation: 'line',
  },
  // House · IL-9 — Which party will win the 2026 U.S. House election in Illinois's 9th District?
  // If this person is the Democratic candidate for U.S. House Illinois District 9, will they w (@Tetraspace)
  {
    race: 'House · IL-9',
    parent: 'NU6OqOEZ2c',
    child: 'psAEEERNIR',
    relation: 'related',
  },
]

type ContractRow = {
  id: string
  question: string
  slug: string
  visibility: string | null
  deleted: boolean | null
  resolution: string | null
  close_time: string | null
}

type Check =
  | { status: 'ok' }
  | { status: 'already linked' }
  | { status: 'linked elsewhere'; parentId: string }
  | { status: 'error'; message: string }

// Reads the child afresh each time, so the recheck under the locks sees a
// market hidden or deleted since the list was printed, as the API would.
async function checkLink(
  pg: SupabaseDirectClient,
  link: RaceLink,
  replace: boolean
): Promise<Check> {
  const child = await pg.oneOrNone<
    Pick<ContractRow, 'id' | 'visibility' | 'deleted'>
  >(`select id, visibility, deleted from contracts where id = $1`, [link.child])
  if (!child) return { status: 'error', message: 'child market not found' }
  const childError = getLinkChildError({
    visibility: child.visibility ?? 'public',
    deleted: !!child.deleted,
    childCount: await getLinkedChildCount(pg, link.child),
  })
  if (childError) return { status: 'error', message: childError }
  const parentError = getLinkParentError(
    await getLinkParentCandidate(pg, link.parent),
    link.child
  )
  if (parentError) return { status: 'error', message: parentError }
  const existing = await getMarketLinkParent(pg, link.child)
  if (existing?.parent_contract_id === link.parent)
    return existing.relation === link.relation
      ? { status: 'already linked' }
      : { status: 'ok' } // same parent, new relation
  if (existing && !replace)
    return { status: 'linked elsewhere', parentId: existing.parent_contract_id }
  return { status: 'ok' }
}

function describe(row: ContractRow | undefined, id: string) {
  if (!row) return `${id} (not found)`
  const closed =
    row.close_time && tsToMillis(row.close_time) <= Date.now() ? ', closed' : ''
  const resolved = row.resolution ? `, resolved ${row.resolution}` : ''
  return `${row.question} (${id}${closed}${resolved})`
}

runScript(async ({ pg }) => {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const replace = args.includes('--replace')
  const asIndex = args.indexOf('--as')
  const createdBy = asIndex >= 0 ? args[asIndex + 1] : JACK1_ID
  if (!createdBy) throw new Error('--as needs a user id')

  const ids = uniq(ELECTION_RACE_LINKS.flatMap((l) => [l.parent, l.child]))
  const rows = keyBy(
    await pg.manyOrNone<ContractRow>(
      `select id, question, slug, visibility, deleted, resolution, close_time
       from contracts where id = any($1::text[])`,
      [ids]
    ),
    'id'
  )

  const checks = new Map<RaceLink, Check>()
  for (const link of ELECTION_RACE_LINKS)
    checks.set(link, await checkLink(pg, link, replace))

  const byRace = groupBy(ELECTION_RACE_LINKS, (l) => l.race)
  for (const [race, links] of Object.entries(byRace)) {
    console.log(
      `\n${race} — ${describe(rows[links[0].parent], links[0].parent)}`
    )
    for (const link of links) {
      const check = checks.get(link)!
      const status =
        check.status === 'error'
          ? `ERROR ${check.message}`
          : check.status === 'linked elsewhere'
          ? `SKIP linked to ${check.parentId}`
          : check.status === 'already linked'
          ? 'SKIP already linked'
          : apply
          ? 'LINK'
          : 'OK'
      console.log(
        `  ${status.padEnd(12)} ${link.relation.padEnd(7)} ${describe(
          rows[link.child],
          link.child
        )}${link.note ? ` — ${link.note}` : ''}`
      )
    }
  }

  const toLink = ELECTION_RACE_LINKS.filter(
    (l) => checks.get(l)!.status === 'ok'
  )
  const counts = {
    ok: toLink.length,
    skipped: ELECTION_RACE_LINKS.filter((l) =>
      ['already linked', 'linked elsewhere'].includes(checks.get(l)!.status)
    ).length,
    errors: ELECTION_RACE_LINKS.filter((l) => checks.get(l)!.status === 'error')
      .length,
  }
  console.log(
    `\n${ELECTION_RACE_LINKS.length} links: ${counts.ok} to make, ${counts.skipped} skipped, ${counts.errors} errors.`
  )
  if (!apply) {
    console.log('Dry run. Pass --apply to write the links.')
    return
  }

  let made = 0
  for (const link of toLink) {
    await pg.tx(async (tx) => {
      // Re-check under the locks the API takes, in case anything moved.
      await lockMarketLinkContracts(tx, [link.child, link.parent])
      const check = await checkLink(tx, link, replace)
      if (check.status !== 'ok') {
        console.log(`  skip ${link.child}: ${JSON.stringify(check)}`)
        return
      }
      await upsertMarketLink(tx, {
        childId: link.child,
        parentId: link.parent,
        relation: link.relation,
        createdBy,
      })
      made++
    })
  }
  console.log(`Linked ${made} markets as ${createdBy}.`)
})

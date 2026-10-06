# Online duplicate check — findings (prod, read-only, 2026-10-06)

Verdicts come from the duplicate classifier in `backend/shared/src/elections/election-market-creation.ts`. EQUIVALENT = an existing party-winner market for the same race (apply would record `skipped-existing` and not create ours). AMBIGUOUS = same race but a different proposition, a candidate market, a combined question or a binary; apply would hold the entry as `needs-review`. To create ours anyway, add the contract id to the entry's `reviewedRejectedContractIds`.

## 2028

| office | entries | checked | clean | with EQUIVALENT | ambiguous only | equivalent findings | ambiguous findings |
|---|---:|---:|---:|---:|---:|---:|---:|
| senate | 34 | 34 | 24 | 1 | 9 | 1 | 17 |
| governor | 11 | 11 | 10 | 0 | 1 | 0 | 1 |
| president | 57 | 57 | 1 | 56 | 0 | 68 | 99 |
| house | 435 | 435 | 434 | 0 | 1 | 0 | 1 |

### EQUIVALENT findings (57 entries) — creation would be SKIPPED unless the id is added to reviewedRejectedContractIds

- **2028-senate-PA-regular-general**
  - ZRCPgdEEdn "Who will win the 2028  senate election in Pennsylvania?" (same office/state/district/year with party outcomes)
- **2028-president-AK-general**
  - glczdn2q09 "Which party will win the 2028 presidential election in Alaska?" (same office/state/district/year with party outcomes)
- **2028-president-AL-general**
  - pPONIpP0hC "Which party will win the 2028 presidential election in Alabama?" (same office/state/district/year with party outcomes)
- **2028-president-AR-general**
  - qRpSnZqnt8 "Which party will win the 2028 presidential election in Arkansas?" (same office/state/district/year with party outcomes)
- **2028-president-AZ-general**
  - 9dgy99NgyR "Which party will win the 2028 presidential election in Arizona?" (same office/state/district/year with party outcomes)
  - 8p2PP5ZuIy "Which party will win the 2028 presidential election in Arizona?" (same office/state/district/year with party outcomes)
- **2028-president-CA-general**
  - dLCgElSShN "Which party will win the 2028 presidential election in California?" (same office/state/district/year with party outcomes)
- **2028-president-CO-general**
  - tElnQ0lUUZ "Which party will win the 2028 presidential election in Colorado?" (same office/state/district/year with party outcomes)
- **2028-president-CT-general**
  - Z5ntQsN2LI "Which party will win the 2028 presidential election in Connecticut?" (same office/state/district/year with party outcomes)
- **2028-president-DC-general**
  - OpEnsCIRg5 "Which party will win the 2028 presidential election in DC?" (same office/state/district/year with party outcomes)
- **2028-president-DE-general**
  - Ay0u92zyqg "Which party will win the 2028 presidential election in Delaware?" (same office/state/district/year with party outcomes)
- **2028-president-FL-general**
  - NSOgE5EtQU "Which party will win the 2028 presidential election in Florida?" (same office/state/district/year with party outcomes)
- **2028-president-GA-general**
  - AgRpZNIOsq "Which party will win the 2028 presidential election in Georgia?" (same office/state/district/year with party outcomes)
  - ZP59COZzOS "Which party will win the 2028 presidential election in Georgia?" (same office/state/district/year with party outcomes)
- **2028-president-HI-general**
  - 8uOl9NEgzQ "Which party will win the 2028 presidential election in Hawaii?" (same office/state/district/year with party outcomes)
- **2028-president-IA-general**
  - hgEgEL5SEu "Which party will win the 2028 presidential election in Iowa?" (same office/state/district/year with party outcomes)
- **2028-president-ID-general**
  - dpgdNLRRs5 "Which party will win the 2028 presidential election in Idaho?" (same office/state/district/year with party outcomes)
- **2028-president-IL-general**
  - EuU28RzAqR "Which party will win the 2028 presidential election in Illinois?" (same office/state/district/year with party outcomes)
- **2028-president-IN-general**
  - UNRdnQ5ZCh "Which party will win the 2028 presidential election in Indiana?" (same office/state/district/year with party outcomes)
- **2028-president-KS-general**
  - tzpS2SNpdg "Which party will win the 2028 presidential election in Kansas?" (same office/state/district/year with party outcomes)
- **2028-president-KY-general**
  - d2URcq8Nsz "Which party will win the 2028 presidential election in Kentucky?" (same office/state/district/year with party outcomes)
- **2028-president-LA-general**
  - PREgpUZdpp "Which party will win the 2028 presidential election in Louisiana?" (same office/state/district/year with party outcomes)
- **2028-president-MA-general**
  - yzUQLLu2p0 "Which party will win the 2028 presidential election in Massachusetts?" (same office/state/district/year with party outcomes)
- **2028-president-MD-general**
  - sIyzI9c6IO "Which party will win the 2028 presidential election in Maryland?" (same office/state/district/year with party outcomes)
- **2028-president-ME-general**
  - pOZ5qnZClc "Which party will win the 2028 presidential election in Maine?" (same office/state/district/year with party outcomes)
- **2028-president-MI-general**
  - dzPpt56nUp "Which party will win the 2028 presidential election in Michigan?" (same office/state/district/year with party outcomes)
  - IUtAAARIZZ "Which party will win the 2028 presidential election in Michigan?" (same office/state/district/year with party outcomes)
- **2028-president-MN-general**
  - Zy98nNRACn "Which party will win the 2028 presidential election in Minnesota?" (same office/state/district/year with party outcomes)
- **2028-president-MO-general**
  - I0RhNQPtd6 "Which party will win the 2028 presidential election in Missouri?" (same office/state/district/year with party outcomes)
- **2028-president-MS-general**
  - AOp2h6CAtq "Which party will win the 2028 presidential election in Mississippi?" (same office/state/district/year with party outcomes)
- **2028-president-MT-general**
  - sqCtn95u0z "Which party will win the 2028 presidential election in Montana?" (same office/state/district/year with party outcomes)
- **2028-president-NC-general**
  - QpR8ghttIZ "Which party will win the 2028 presidential election in North Carolina?" (same office/state/district/year with party outcomes)
  - PISlZNCLR2 "Which party will win the 2028 presidential election in North Carolina?" (same office/state/district/year with party outcomes)
- **2028-president-ND-general**
  - 8pnz80sS5g "Which party will win the 2028 presidential election in North Dakota?" (same office/state/district/year with party outcomes)
- **2028-president-NE-general**
  - IglANsO0CS "Which party will win the 2028 presidential election in Nebraska?" (same office/state/district/year with party outcomes)
- **2028-president-NH-general**
  - 6Ilzq5Lctg "Which party will win the 2028 presidential election in New Hampshire?" (same office/state/district/year with party outcomes)
- **2028-president-NJ-general**
  - Pds8QhlUuR "Which party will win the 2028 presidential election in New Jersey?" (same office/state/district/year with party outcomes)
- **2028-president-NM-general**
  - Qcu2QpZgQ9 "Which party will win the 2028 presidential election in New Mexico?" (same office/state/district/year with party outcomes)
- **2028-president-NV-general**
  - 2sU8Nn0AlE "Which party will win the 2028 presidential election in Nevada?" (same office/state/district/year with party outcomes)
  - lpNAnZZtAz "Which party will win the 2028 presidential election in Nevada?" (same office/state/district/year with party outcomes)
- **2028-president-NY-general**
  - sNzuhCSgtR "Which party will win the 2028 presidential election in New York?" (same office/state/district/year with party outcomes)
- **2028-president-OH-general**
  - Ehqphnz0tA "Which party will win the 2028 presidential election in Ohio?" (same office/state/district/year with party outcomes)
- **2028-president-OK-general**
  - zSStNCPRht "Which party will win the 2028 presidential election in Oklahoma?" (same office/state/district/year with party outcomes)
- **2028-president-OR-general**
  - Zn9hNCQu02 "Which party will win the 2028 presidential election in Oregon?" (same office/state/district/year with party outcomes)
- **2028-president-PA-general**
  - tdQdZd0Plg "Which party will win the 2028 presidential election in Pennsylvania?" (same office/state/district/year with party outcomes)
- **2028-president-RI-general**
  - ulRdlQIZg2 "Which party will win the 2028 presidential election in Rhode Island?" (same office/state/district/year with party outcomes)
- **2028-president-SC-general**
  - L2SLRIRl6U "Which party will win the 2028 presidential election in South Carolina?" (same office/state/district/year with party outcomes)
- **2028-president-SD-general**
  - yLyuzCPpgS "Which party will win the 2028 presidential election in South Dakota?" (same office/state/district/year with party outcomes)
- **2028-president-TN-general**
  - 8N6RzusU8C "Which party will win the 2028 presidential election in Tennessee?" (same office/state/district/year with party outcomes)
- **2028-president-TX-general**
  - yIsQd2Rqcq "Which party will win the 2028 presidential election in Texas?" (same office/state/district/year with party outcomes)
- **2028-president-UT-general**
  - 0099I2E2EL "Which party will win the 2028 presidential election in Utah?" (same office/state/district/year with party outcomes)
- **2028-president-VA-general**
  - USzunIZqQd "Which party will win the 2028 presidential election in Virginia?" (same office/state/district/year with party outcomes)
- **2028-president-VT-general**
  - 0dPRNShgnl "Which party will win the 2028 presidential election in Vermont?" (same office/state/district/year with party outcomes)
- **2028-president-WA-general**
  - c5R68SUuyR "Which party will win the 2028 presidential election in Washington?" (same office/state/district/year with party outcomes)
- **2028-president-WI-general**
  - UgnOcS2ddg "Which party will win the 2028 presidential election in Wisconsin?" (same office/state/district/year with party outcomes)
- **2028-president-WV-general**
  - 9U5IENILtZ "Which party will win the 2028 presidential election in West Virginia?" (same office/state/district/year with party outcomes)
- **2028-president-WY-general**
  - yQLnLqP5gu "Which party will win the 2028 presidential election in Wyoming?" (same office/state/district/year with party outcomes)
- **2028-president-ME-01-general**
  - Atdns09Oqz "Which party will win the 2028 presidential election in Maines 1st Congressional District?" (same office/state/district/year with party outcomes)
- **2028-president-NE-01-general**
  - ZnPPIg0QRE "Which party will win the 2028 presidential election in Nebraskas 1st Congressional District?" (same office/state/district/year with party outcomes)
- **2028-president-NE-02-general**
  - L2gCNl2hZN "Which party will win the 2028 presidential election in Nebraskas 2nd Congressional District?" (same office/state/district/year with party outcomes)
- **2028-president-NE-03-general**
  - nyUuU9t0Pz "Which party will win the 2028 presidential election in Nebraskas 3rd Congressional District?" (same office/state/district/year with party outcomes)
- **2028-president-US-general**
  - gUpCZZnNQz "Which party will win the 2028 presidential election?" (same office/state/district/year with party outcomes)
  - PAtudSIsN6 "What Party will the Winning 2028 Presidential Candidate be?" (same office/state/district/year with party outcomes)
  - CnIys9Ucc9 "What party will win the November 2028 Presidential election? " (same office/state/district/year with party outcomes)
  - ghp8ILRnny "Which party will the winner of the 2028 US Presidential Election be from?" (same office/state/district/year with party outcomes)
  - 6AlnL5h85P "Which party will win the 2028 US presidential election?" (same office/state/district/year with party outcomes)
  - dm9roaqls1 "Which party will win the 2028 US Presidential election?" (same office/state/district/year with party outcomes)
  - dgUXwJtDik3QaYJKQCrv "Which party will win the 2028 US Presidential Election?" (same office/state/district/year with party outcomes)
  - 8p6sy5snq9 "Which political party wins the US presidency in 2028?" (same office/state/district/year with party outcomes)

### AMBIGUOUS findings (20 entries, 118 markets) — each blocks its entry as needs-review until rejected or accepted

- **2028-president-US-general** (90)
  - uRh8q8ZnPs "Will Democrats win back the white house in 2028?" (binary party market for this race; ours is three-way)
  - ZL5Rg0AOSd "Will Democrats win all 7 ‘swing states’ in the 2028 presidential election?" (primary/margin/conditional/derivative wording)
  - Ndg8IlQLPl "Who will be the Democratic nominee, and will they win the 2028 presidential election?" (primary/margin/conditional/derivative wording)
  - De4ac2c409 "Will JD Vance, Marco Rubio OR Gavin Newsom win the 2028 presidential election?" (same race, different proposition or answer set)
  - Daaca09d1e "Will a Democrat win the 2028 Presidential Election?" (binary party market for this race; ours is three-way)
  - D9babfa90f "Will a Democrat win the 2028 Presidential Election?" (binary party market for this race; ours is three-way)
  - 6PuIlSlCOO "Will the winner of the 2028 presidential election be one of AOC, Newsom, Vance or Rubio?" (same race, different proposition or answer set)
  - IcgRN6gQP2 "Will The Democrats Win Every Presidential Election from 2028 to 2040?" (primary/margin/conditional/derivative wording)
  - NN6SZcUq0y "Will JD Vance, Marco Rubio OR Gavin Newsom win the 2028 presidential election?" (same race, different proposition or answer set)
  - nLzhlEl6sO "Will the 2028 presidential election winner be a millennial?" (primary/margin/conditional/derivative wording)
  - y2CpthtZZg "Which party will win the 2028 presidential election? / Will prediction markets be legal in 2030?" (combined or multi-part question)
  - 6ICctR2dA6 "In 2028, will it be harder to get a DCM license than in 2026? // Will a Democrat win the 2028 presidential election?" (combined or multi-part question)
  - … 78 more in dry-run-online.json
- **2028-senate-PA-regular-general** (5)
  - sROyylpZz6 "Pennsylvania Democratic Senate nominee? (2028)" (primary/margin/conditional/derivative wording)
  - I9EszZEtLL "Will John Fetterman win the 2028 Pennsylvania Senate Election?" (same race, different proposition or answer set)
  - AqO59U9nIl "Who will win the 2028 Pennsylvania Democratic primary for the US Senate?" (primary/margin/conditional/derivative wording)
  - zd96hNQlCu "2028 Pennsylvania Democratic Senate Nominee?" (primary/margin/conditional/derivative wording)
  - Aups80Qgpy "Which US Senators and Candidates will win?" (same race, different proposition or answer set)
- **2028-senate-WI-regular-general** (3)
  - hZE5pqZ8p8 "Who will win the 2028 Democratic primary for senate in Wisconsin?" (primary/margin/conditional/derivative wording)
  - D5951aa2e7 "Democrats win 2028 Wisconsin Senate election?" (binary party market for this race; ours is three-way)
  - IC0sZIpp5U "Democrats win 2028 Wisconsin Senate election?" (binary party market for this race; ours is three-way)
- **2028-senate-GA-regular-general** (2)
  - Dea500b0db "Democrats win 2028 Georgia Senate election?" (binary party market for this race; ours is three-way)
  - NRzchgUzPu "Democrats win 2028 Georgia Senate election?" (binary party market for this race; ours is three-way)
- **2028-president-IA-general** (2)
  - 9thydC8qSN "Who will win the 2028 Iowa Democratic presidential caucuses?" (same race, different proposition or answer set)
  - EgLsNldtZl "Who will win the 2028 Iowa Republican presidential caucuses?" (same race, different proposition or answer set)
- **2028-president-NH-general** (2)
  - yQQLsZsqNZ "Who will win the 2028 New Hampshire Democratic presidential primary?" (primary/margin/conditional/derivative wording)
  - tZptdQEpu8 "Who will win the 2028 New Hampshire Republican presidential primary?" (primary/margin/conditional/derivative wording)
- **2028-senate-AK-regular-general** (1)
  - qslt8Cstdz "Will Lisa Murkowski win the 2028 US Senate election in Alaska?" (same race, different proposition or answer set)
- **2028-senate-CO-regular-general** (1)
  - PNnARCuALc "2028 Colorado Senate Democratic Primary Winner?" (primary/margin/conditional/derivative wording)
- **2028-senate-IN-regular-general** (1)
  - S2SAZShzgp "Which 2028 US Senate elections will a Democrat win?" (regular/special election wording differs)
- **2028-senate-IA-regular-general** (1)
  - OLgd06CzcN "Will Chuck Grassley run for reelection in 2028 to a ninth term as US Senator from Iowa?" (primary/margin/conditional/derivative wording)
- **2028-senate-NY-regular-general** (1)
  - cpgsPsNnQE "2028 New York Democratic Senate Nominee?" (primary/margin/conditional/derivative wording)
- **2028-senate-OR-regular-general** (1)
  - S2SAZShzgp "Which 2028 US Senate elections will a Democrat win?" (regular/special election wording differs)
- **2028-senate-UT-regular-general** (1)
  - uZ2gZZun6U "Will the Republican Party candidate win the 2028 US Senate election in Utah?" (binary party market for this race; ours is three-way)
- **2028-governor-WV-regular-general** (1)
  - CIuEZ90El5 "Will Jim Justice run for Governor of West Virginia in 2028?" (primary/margin/conditional/derivative wording)
- **2028-president-ME-general** (1)
  - FkyWAnOISxd2uEur7Vuh "Will Maine switch to a winner takes all presidential election system by the 2028 elections?" (same race, different proposition or answer set)
- **2028-president-NE-general** (1)
  - naMJYS4UuK0fbsgxgYGF "Will Nebraska switch to a winner takes all presidential election system by the 2028 elections?" (same race, different proposition or answer set)
- **2028-president-PA-general** (1)
  - yqPnn2qd6P "Will the 2028 Democratic Candidate for President win Pennsylvania?" (primary/margin/conditional/derivative wording)
- **2028-president-SC-general** (1)
  - OsZngC899Z "Who will win the 2028 South Carolina Democratic presidential primary?" (primary/margin/conditional/derivative wording)
- **2028-president-TX-general** (1)
  - dIXJEEBVF6X78nZV7hST "Will a Democrat win Texas in the 2028 presidential election?" (binary party market for this race; ours is three-way)
- **2028-house-VT-00-regular-general** (1)
  - 80UHURQSzr7t89dZN6SZ "Will Vermont have had two female representatives by 2028?" (primary/margin/conditional/derivative wording)

## 2032

| office | entries | checked | clean | with EQUIVALENT | ambiguous only | equivalent findings | ambiguous findings |
|---|---:|---:|---:|---:|---:|---:|---:|
| senate | 33 | 33 | 32 | 0 | 1 | 0 | 1 |
| governor | 11 | 11 | 11 | 0 | 0 | 0 | 0 |
| president | 57 | 57 | 56 | 1 | 0 | 1 | 9 |

### EQUIVALENT findings (1 entries) — creation would be SKIPPED unless the id is added to reviewedRejectedContractIds

- **2032-president-US-general**
  - 6qZZpIhzLn "Which political party wins the US presidency in 2032?" (same office/state/district/year with party outcomes)

### AMBIGUOUS findings (2 entries, 10 markets) — each blocks its entry as needs-review until rejected or accepted

- **2032-president-US-general** (9)
  - c2gypz9lng "Will the winner of the 2032 presidential election be an incumbent?" (same race, different proposition or answer set)
  - QgtnCILzA2 "Will a democrat win the 2032 presidential election?" (binary party market for this race; ours is three-way)
  - d0sunNgggN "Will the winner of the 2028 US Presidential Election win the 2032 US Presidential Election?" (names more than one year)
  - RdDaOvPvcZI0QtBFZ1oz "Who will win the 2032 United States presidential election? [ADD RESPONSES]" (same race, different proposition or answer set)
  - UQBHCia2YrwFRJ24TlBw "Who will win the US presidential elections in 2032?" (same race, different proposition or answer set)
  - 2lbO8ztHRtqA7QHDTwsR "Who will win the 2032 United States presidential election?" (same race, different proposition or answer set)
  - rsfOXvYRTXMkjZQTGk45 "Will the democratic party win the 2032 U.S. presidential election?" (binary party market for this race; ours is three-way)
  - wPlFXk0yqztHC95I6mHH "Will the winner of 2032 US presidential election be less than 6ft (183cm) tall?" (same race, different proposition or answer set)
  - YU9NDioufC0djV127nHk "Who will win the 2032 united states presidential election?" (same race, different proposition or answer set)
- **2032-senate-TX-regular-general** (1)
  - mtUnz6UW07eb2pPA2wqP "Will Texas elect a Democrat to the U.S. Senate in any election through 2032?" (same race, different proposition or answer set)

## 2036

| office | entries | checked | clean | with EQUIVALENT | ambiguous only | equivalent findings | ambiguous findings |
|---|---:|---:|---:|---:|---:|---:|---:|
| senate | 33 | 33 | 32 | 0 | 1 | 0 | 1 |
| governor | 11 | 11 | 11 | 0 | 0 | 0 | 0 |
| president | 57 | 57 | 56 | 1 | 0 | 1 | 3 |

### EQUIVALENT findings (1 entries) — creation would be SKIPPED unless the id is added to reviewedRejectedContractIds

- **2036-president-US-general**
  - Lpd8dcEds5 "Which political party wins the US presidency in 2036?" (same office/state/district/year with party outcomes)

### AMBIGUOUS findings (2 entries, 4 markets) — each blocks its entry as needs-review until rejected or accepted

- **2036-president-US-general** (3)
  - MoUhTyVTG8OLznnjbpok "Who will win the US presidential elections in 2036?" (same race, different proposition or answer set)
  - 0PbT7DglPGtI9NlFLR0Y "Will a Democrat win the 2036 presidential election?" (binary party market for this race; ours is three-way)
  - U8OEV1Ily83NDwDeHxxz "Who will win the 2036 United States presidential election?" (same race, different proposition or answer set)
- **2036-senate-TX-regular-general** (1)
  - kmIRNMqklHt2NLjfl1Db "Will Texas elect a Democrat to the U.S. Senate in any election through 2036?" (same race, different proposition or answer set)

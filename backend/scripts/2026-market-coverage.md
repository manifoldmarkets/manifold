# 2026 Midterms — Market Coverage & Gaps

What the `/election` page needs vs. what community markets currently supply.
"Missing" = no usable community market wired; create an official ManifoldPolitics
version (see `create-2026-election-markets.ts`, which already enumerates the full
Senate + Governor sets, so running it fills every gap below).

Snapshot date: 2026-06-23.

---

## Senate — 34 / 35 covered

35 races: 33 Class-2 seats + 2 specials (OH = Vance seat, FL = Rubio seat).

- **Covered (34):** AL AK AR CO DE GA ID IL IA KS KY LA ME MA MI MN MS MT NE NH
  NJ NM NC OH OK OR RI SC SD TN TX VA WV WY — wired in `senate2026`.
- **MISSING (1):** **FL** (special election for Rubio's seat) — no community
  party market found. → create.

## Governor — 14 / 36 covered

36 gubernatorial races in 2026.

- **Covered (14):** TX GA MA CA NY AK AZ IA NV AR NH NE CO NM — wired in
  `governors2026`.
- **MISSING (22):** AL CT FL HI ID IL KS ME MD MI MN OH OK OR PA RI SC SD TN VT
  WI WY — no usable community party market. → create.

## House — 68 districts via one community market

Wired market `will-a-democrat-win-these-us-house` (independent multi-choice,
each answer = a district, YES = Democrat wins). 68 districts across 26 states:

  AK 1 · AZ 3 · CA 11 · CO 2 · CT 1 · FL 2 · IL 1 · IN 1 · IA 2 · ME 1 · MI 5 ·
  MT 1 · NE 1 · NV 3 · NH 2 · NJ 3 · NM 1 · NY 6 · NC 1 · OH 3 · OR 1 · PA 5 ·
  TX 3 · VA 4 · WA 2 · WI 2

- This is one creator's competitive-district selection. It works, but we don't
  control the district set or resolution.
- **To improve:** create an official district market with a deliberate
  competitive set (e.g. all Cook/Sabato toss-up + lean seats, ~30–45 districts).
  `create-2026-election-markets.ts` has a `HOUSE_DISTRICTS` starter list to curate.

## Conditional macro matrix — 0 / 15 covered

None exist. All 15 (5 metrics × 3 control configs) are defined in the creation
script and must be created. → create.

## Headline aggregates — community, working

- Balance of Power (multi): `balance-of-power-who-will-control-t` (JonasVollmer)
- House control (binary): `republicans-have-house-majority-aft` (ryanmccomb)
- Senate control (binary): `will-republicans-win-the-senate-in-738388924521` (AndrewG)

Not "missing" — but if we want resolution control + sweeps versions, remake as
official. The hero panel + needle read from these.

---

## Summary — to create

| Bucket | Missing | Action |
|---|---|---|
| Senate | FL special | 1 market |
| Governor | 22 states | 22 markets |
| House districts | (district set TBD) | 1 multi-choice market, curated answers |
| Conditional matrix | all 15 | 15 markets |
| Aggregates | none (optional remake) | 0–3 |

Running `create-2026-election-markets.ts` covers Senate (all 35), Governor (all
36), House, and the conditionals in one pass — it overwrites nothing (idempotent
by question), so it only adds what's missing.

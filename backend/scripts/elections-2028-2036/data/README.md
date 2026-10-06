# Results data for the Stage A seeds

`presidential-results.json` is the only file the generator reads. It holds
two-party presidential results (Democratic, Republican, total votes) for every
unit the seeds need, with the source recorded per row. Fetched 2026-10-06.

| unit | 2020 | 2024 | source |
|---|---|---|---|
| 50 states + DC | FEC *Federal Elections 2020*, Table 2 (`federalelections2020.xlsx`, sheet "3. Table 2 Electoral & Pop Vote") | FEC *Official 2024 Presidential General Election Results* (`2024presgeresults.xlsx`, dated January 16, 2025) | https://www.fec.gov/resources/cms-content/documents/federalelections2020.xlsx and https://www.fec.gov/resources/cms-content/documents/2024presgeresults.xlsx |
| ME-01, ME-02, NE-01, NE-02, NE-03 (elector districts) and all 435 House districts on the 2026 lines | The Downballot, exact totals tab (2020 only where the lines are unchanged since 2020: 262 districts) | The Downballot, exact totals tab (all 435) | https://docs.google.com/spreadsheets/d/1eZfaFI-c-PFOoKx1-zZA2MP0_dxRq_LVK0re3BOQqy0 (tab `gid=1491069057`), linked from https://www.the-downballot.com/p/the-downballots-calculations-of-presidential |

The Downballot's sheet is kept verbatim as `downballot-2024-exact-on-2026-lines.csv`
(CSV export of the exact-totals tab). Its district lines are the ones in force
for November 2026: the post-2025 maps in Texas, California, North Carolina,
Ohio and Utah, and the 2026 maps in Florida, Tennessee, Louisiana and Alabama;
Missouri is on its 2022 map (the one the Supreme Court kept for 2026). Those
nine redrawn states have no 2020 figures on the new lines, so their districts'
leans use 2024 alone (`yearsUsed` in each seed records this).

Rebuilding the JSON (the FEC workbooks are not committed; download them to a
scratch folder first):

```sh
# unzip each .xlsx (copy to .zip, Expand-Archive on Windows) next to build-results.js, then
node build-results.js > presidential-results.json
```

`xlsx2json.js` is the dependency-free sheet reader `build-results.js` uses.

The national two-party totals the leans are measured against are the sums of
the 51 state rows: 2020 D 81,283,501 / R 74,223,975; 2024 D 75,017,613 /
R 77,302,580 (both match the FEC national totals).

# Manifold Data

Manifold has run public prediction markets continuously since December 2021. This page describes that dataset and how to license it.

Access comes in three steps, so you can confirm the data fits your work before committing to it:

1. **[Public dumps](#public-dumps)** — free, non-commercial. A 2024 snapshot, enough to see whether the data fits.
2. **[Evaluation license](#evaluation-license)** — paid, non-commercial. The full, current corpus, to test at real scale.
3. **[Full license](#full-license)** — commercial rights to the components you need.

Evaluation fees credit against a full license, so step 2 is not a detour.

---

## The Dataset

_Dataset figures and licensing terms on this page are current as of August 2026._

The corpus divides into three independently licensable components. All three share market IDs and consistent pseudonymized user IDs, so any combination joins cleanly.

**A. Reasoning-Trace Corpus** — 876k+ user-authored comments (~45M tokens of extracted text): arguments, evidence, belief updates, and resolution disputes, each timestamped against the market's live probability and joined to its eventual outcome. Persistent per-author pseudonyms enable forecaster track-record modeling.

**B. Labeled Question Corpus** — 205k+ markets / ~607k independently priced outcomes with full question text, rich metadata (topics, market type, timing, engagement), and definitive resolutions on 138k+ markets. A supervised dataset of forecastable questions with ground-truth labels.

**C. Probability Time-Series** — the complete transaction ledger (69M+ rows; 13.5M fully-filled trades) with implied probability before and after every trade, limit-order lifecycle for orderbook reconstruction, liquidity events, and the financial transaction ledger. Point-in-time by construction; zero look-ahead bias.

_Counts are platform totals. Deliveries cover public, non-deleted markets, so delivered files run slightly below these totals._

---

## 1. Public Dumps — Free, Non-Commercial {#public-dumps}

A one-time snapshot of markets, trades, and comments from December 2021 through July 2024, provided for research and testing: academic work, personal data analysis, and backtesting.

**These data dumps are provided for personal and non-commercial use only.** By downloading, you agree to the data usage restrictions in our [Terms of Service](https://manifold.markets/terms).

- [Bets data 2024-07-04](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-dump-bets-04072024.json.zip?alt=media&token=5ff8fd10-8079-4570-9728-7d0be1d4a463) (967MB)
- [Markets data 2024-07-06](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-contracts-20240706.json.zip?alt=media&token=ca3ef6b6-fe61-41b4-a789-dcc2d4ea4421) (87MB)
- [Comments data 2024-07-06](https://firebasestorage.googleapis.com/v0/b/mantic-markets.appspot.com/o/trade-dumps%2Fmanifold-comments-20240706.json.zip?alt=media&token=08f9a2b1-534a-493d-bb01-77cf1f54b9f3) (127MB)

These files are archival: they are not refreshed, and they stop well short of the live platform. To work with current data, or at full scale, move to an evaluation license.

---

## 2. Evaluation License — Paid, Non-Commercial {#evaluation-license}

The complete, current corpus — all three components — under a paid, non-commercial license, so you can assess the data at full scale and against live markets before committing to commercial terms.

An evaluation covers assessing the data. Production use, commercial products, and models you ship require a full license. Evaluation fees credit against a full license.

---

## 3. Full License — Commercial {#full-license}

Commercial applications, AI/ML training, and enterprise use are covered by an annual, non-exclusive license. License the whole corpus, or only the components you need.

### Licensing Options

**Single component** — license A, B, or C on its own. Priced as a one-off fee for the historical backlog (the full history back to launch in December 2021) plus an annual fee covering the ongoing feed and the license rights themselves. Two-year minimum term.

**Full corpus** — all three components, delivered as one coherent, joinable dataset, with the historical backlog included at no separate charge. No minimum term.

**Topic vertical** — a single vertical of a component (for example: economics & finance; politics & geopolitics; sports; AI & technology) at a reduced rate. Two verticals cost more than one; three or more price as the full component.

**Stratified sample** — a representative ~20% cross-section of markets, for teams that want commercial rights at reduced scale. Upgradeable to full scale with full credit of fees paid within 12 months.

### Included in Every License

- Monthly data refresh
- Access to the production API and the real-time WebSocket feed
- Bulk delivery as Parquet files in access-controlled, S3-compatible cloud storage
- A data dictionary shipped alongside the data
- 30 days' notice before breaking changes to the delivered schema

### License Terms (Summary)

Licenses are non-exclusive and cover internal use by the licensee and its affiliates, with the licensee responsible for affiliate compliance. They include production use of models, signals, and strategies derived from the data, and AI/ML training rights (fine-tuning and post-training) for internal models.

They exclude: redistribution or resale of the data; re-identification of pseudonymized users; use of the data to contact or recruit platform users; and use of the data to build a competing prediction-market or forecasting-data product.

Delivered data is pseudonymized and covers public, non-deleted markets.

### Pricing

List pricing is reviewed annually, and licensees committing to a multi-year term have their rate locked for the full committed term. Custom scopes — specific table subsets, delivery arrangements, extended history commitments — are available on request.

---

## Contact

For a current price schedule, evaluation terms, or to discuss a custom scope, contact:

**[data@manifold.markets](mailto:data@manifold.markets)**

---

## API Access

For programmatic access to Manifold data, see our [API documentation](./api). Note that using API data to train AI/ML models for commercial purposes requires a data license — see our [Terms of Service](https://manifold.markets/terms).

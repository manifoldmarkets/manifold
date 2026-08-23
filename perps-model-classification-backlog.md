# Open-weight classification queue — 2026-08-21 sweep

120 models had accumulated in the review queue. 111 are now adjudicated
(1 by admin through the tool, 110 by `backend/scripts/classify-pending-models.ts`).
9 are deliberately left pending, because they have no truthful boolean.

## Method used for the 110

Per the documented rebuild procedure, with one tightening:

- Candidate weights repos come from the **publisher's own HuggingFace org**
  (with the org-alias map: `z-ai`→`zai-org`, `cohere`→`CohereLabs`,
  `minimax`→`MiniMaxAI`, `dots-studio`→`dots-studio`, …). A third-party
  fine-tune, quant, or distill is *not* the model's weights.
- Matched on normalized name with **version numbers preserved**.
- Verified against the live API: repo resolves, not private, carries real
  weight files.

The publisher-org restriction is load-bearing. A first pass that fell back to
global HuggingFace search produced a string of confident false positives —
`openai/gpt-3.5-turbo` → `jondurbin/airoboros-gpt-3.5-turbo-100k-7b`,
`~z-ai/glm-latest` → a random INT4 quant, `qwen/qwen3-max` → a DavidAU GGUF of
a different model. Every one of them verified cleanly as "a public repo with
weight files" and every one would have marked a closed frontier model open.

Three cases where the mechanical answer was wrong and the check mattered:

| Model | Mechanical guess | Truth |
|---|---|---|
| `qwen/qwen3-coder-flash` | `Qwen3-Coder-30B-A3B-Instruct` exists, looks like a match | **Closed.** OpenRouter describes it as "Alibaba's fast and cost efficient version of their **proprietary** Qwen3 Coder Plus" |
| `upstage/solar-pro-3` | `upstage/solar-pro3-tokenizer` resolves | **Closed.** Tokenizer-only, 0 weight files — the exact trap `huggingface.ts` calls out |
| `mistralai/mistral-medium-3` | prefix-matches `Mistral-Medium-3.5-128B` | **Closed.** 3 ≠ 3.5; no Medium-3 repo exists |

## Results

**13 open** — all re-verified against the live API at write time:

| Model | Weights |
|---|---|
| `aion-labs/aion-rp-llama-3.1-8b` | `aion-labs/Aion-RP-Llama-3.1-8B` |
| `arcee-ai/virtuoso-large` | `arcee-ai/Virtuoso-Large` |
| `cohere/command-r-08-2024` | `CohereLabs/c4ai-command-r-08-2024` |
| `cohere/command-r-plus-08-2024` | `CohereLabs/c4ai-command-r-plus-08-2024` |
| `cohere/command-r7b-12-2024` | `CohereLabs/c4ai-command-r7b-12-2024` |
| `deepcogito/cogito-v2.1-671b-20251118` | `deepcogito/cogito-671b-v2.1` |
| `dots-studio/dots-3-note-preview-20260813` | `dots-studio/dots3-note-prev` |
| `google/gemma-2-27b-it` | `google/gemma-2-27b-it` |
| `meta-llama/llama-guard-4-12b` | `meta-llama/Llama-Guard-4-12B` |
| `minimax/minimax-m1` | `MiniMaxAI/MiniMax-M1-40k` |
| `mistralai/ministral-8b` | `mistralai/Ministral-8B-Instruct-2410` |
| `mistralai/mistral-large` | `mistralai/Mistral-Large-Instruct-2407` (Large 2, 24.07) |
| `mistralai/mistral-large-2407` | `mistralai/Mistral-Large-Instruct-2407` |

**97 closed** — no weights repo in the publisher's org, and no public repo
elsewhere that both names the model and carries weight files. Dominated by
`openai` (31), `google` Gemini/Lyria (12), `anthropic` (7), `qwen` Max/Plus
tiers (7), `bytedance-seed` (5), `perplexity` (5), `amazon` Nova (4).

**1 by admin**: `z-ai/glm-5.3-20260816` → closed. Independently confirmed:
`zai-org` has 150 public repos and no GLM-5.3 (latest is GLM-5, 2026-08-11);
all direct probes 401; the only two global hits are third-party repos with
zero weight files; OpenRouter lists it API-only with no HF link.

Worth noting the nightly agent had recommended **open** for GLM 5.3, citing
`zai-org/GLM-5` — a sibling, not the model. The name check rejected it and sent
it to a human, which is exactly the design working.

---

## Status — both open issues closed 2026-08-24

Branch `fix/open-weight-classification-audit` (2 commits). Everything below was
open when this doc was written on 2026-08-21; all of it has since landed, and a
full re-audit turned up four real misclassifications in the process.

### Resolved — routers and floating aliases (was open issue 1)

`isCompositeSlug` in `open-weight-models.ts` now excludes the 6 router slugs and
any `~`-prefixed alias from BOTH sides of the index, the way `OTHER_MODEL_KEY`
is excluded. Unclassified was the worse option — it starts a grace clock and
eventually halts the feed, forcing a boolean under deadline for something that
has none.

Not silent: `compositeSlugs` / `compositeTokens` come back in the result and
`update-openrouter-share.ts` logs the slugs and their share of payload tokens on
every tick that has one.

The alias half got a better answer than this doc proposed. OpenRouter publishes
`alias_target`, so `~z-ai/glm-latest -> z-ai/glm-5.3` is machine-readable. If an
alias ever carries real volume, resolve through that field and classify the
target rather than exclude — the log is the trigger.

### Resolved — `gated: "manual"` (was open issue 2)

`isPubliclyGettable` now accepts `"manual"`, matching the seed, which classifies
all eleven such repos open (every Llama and Gemma). This could not stay deferred:
the new audit job reported all eleven as "no longer verifies" on its first run
against prod, and a standing false alarm is how an alert gets ignored.

### New — the audit that did not exist

`update-classification-audit.ts`, nightly at 03:40 LA, plus
`backend/scripts/run-classification-audit.ts` to run it on demand. Read-only;
it raises flags, never writes a verdict.

Found four seed entries marking open models closed — Kimi K3, Mistral Large 3
2512, Mistral Medium 3.5, Ling-3.0-flash — all corrected, list version bumped to
`2026-08-24`. Verified clean against prod afterwards: 175 open + 124 closed, no
disagreements.

### New — `repoOwnerMatchesPublisher`

Blocks the fabricated-repo vector. `brokenshards/ox-alpha` passed both existing
guards; provenance is what a name cannot fake. Downgrades to unresolved, never
to closed, because cross-publisher releases are real.

---

## Still open

- **120 pending classifications are still unapplied.**
  `backend/scripts/classify-pending-models.ts --apply` has never been run — the
  run was blocked by a permission prompt. Dry run was clean.
- **Index impact of the four corrections is unquantified.** Needs the rankings
  dataset, i.e. `OPENROUTER_API_KEY` from Secret Manager.
- **Whether to recompute historical points.** The four errors predate the list
  cut, so this is a correction rather than a forward-dated reclassification.
  That is a decision about what the market settled on, not a technical one.
- **Deploy.** The audit job is scheduler-side; it needs a `scheduler-perps`
  deploy to start running.

---

## Original write-up (2026-08-21), kept for the reasoning

## Open issue 1 — routers and floating aliases have no truthful boolean

Left pending. None has ever ranked, so nothing is halting today; the risk is
that one cracks the top 50 and forces a bad call under a 48-hour deadline.

**6 router slugs**: `openrouter/auto`, `auto-beta`, `bodybuilder`, `free`,
`fusion`, `pareto-code`.

These are not models. OpenRouter documents Fusion as "a panel of expert models
… analyzes your prompt in parallel … then a judge model synthesizes their
responses", priced as the sum of the underlying completions. Its token volume
is a *mixture* of open and closed models. Classifying it either way
misattributes all of it.

**3 floating aliases**: `~z-ai/glm-latest`, `~deepseek/deepseek-v4-flash-latest`,
`~moonshotai/kimi-latest`.

These resolve to whatever the publisher's current model is. Their status
genuinely changes under us: `~z-ai/glm-latest` points at GLM 5.3 today, which
is **closed**, while every previous GLM is open. A stored boolean silently goes
stale, and nothing in the system would notice.

The other 9 aliases (`~anthropic/*`, `~openai/*`, `~google/gemini-*`,
`~x-ai/grok-latest`) were classified closed — every model in those families is
closed, so the alias is closed regardless of where it points. Precedent:
`openai/chatgpt-4o-latest` is already closed in the seed.

**Recommended fix:** exclude router and alias slugs structurally, the way
`OTHER_MODEL_KEY` is excluded — they are not members of the "top 50 models"
population the index is defined over. Failing that, resolve aliases to their
target at tick time rather than storing a verdict against the alias. Either
beats a boolean that is wrong by construction.

## Open issue 2 — `gated: "manual"` means opposite things in two places

`shared/huggingface.ts`'s `isPubliclyGettable` accepts only
`null | false | 'auto'`, so it treats `gated: "manual"` as **not** publicly
gettable:

> Discretionary gating does NOT: … `"manual"` means the owner approves each
> request individually, so the public cannot in fact get the weights.

But the published seed classifies every `manual`-gated Llama and Gemma as
**open** — `google/gemma-3-27b-it`, `meta-llama/Llama-3.3-70B-Instruct`,
`Llama-4-Maverick`, `Llama-4-Scout`, and more. The settled methodology is that
anyone may accept those licences and download, so they are open.

Today this is only conservative: the auto-verifier fails into "ask a human"
rather than misclassifying, so nothing is wrong in the index. But it means the
nightly watcher can *never* auto-confirm a Llama or Gemma release, and every
one will land in the review queue on a 48-hour clock — which is a
manufactured outage waiting for the next Llama launch.

`classify-pending-models.ts` uses its own verifier that accepts `manual` and
records the gating value in the evidence, so it matches the list it writes
into. That is a local fix for one script, not a resolution.

**Decide one policy and apply it in both places.** If `manual` is open, widen
`isPubliclyGettable` and let the watcher auto-classify Llama/Gemma. If it is
not, the seed's Llama and Gemma entries are wrong and the published methodology
needs to say so. Right now the code and the published list disagree.

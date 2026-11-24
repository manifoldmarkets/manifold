begin;

-- A PROVISIONAL verdict: "I don't know, and I am not expected to yet."
--
-- The operator looked and could not establish the positive claim — public
-- weights for the open-weight index, Chinese headquarters for the lab index —
-- because the model is anonymous (a stealth preview) or the publisher has
-- announced weights that have not shipped. Until now that had two spellings,
-- both bad: leave the row pending, which excludes it from the index and (for a
-- ranked open-weight model) starts a two-day clock to a feed halt; or type a
-- closed/non-Chinese verdict with invented evidence to satisfy the form, which
-- nothing ever re-examined.
--
-- A provisional row takes the DEFAULT side of its index — closed; non-Chinese,
-- the same denominator-only treatment the audited seed gives OpenRouter's own
-- cloaked slugs — so the feed stops excluding it, and the watcher re-examines
-- it on a weekly cadence until a human replaces it with a firm verdict. The
-- verdict columns are unchanged in meaning: `open is false` and
-- `is_chinese is false` still read as closed and non-Chinese to the oracle.
-- The flag only says WHY, and that the row is still under review.

alter table model_classifications
  add column if not exists provisional boolean not null default false,
  -- Always the default side: weights that cannot be found are closed. An open
  -- verdict cites a verified repo and is never provisional.
  add constraint model_classifications_provisional_is_closed
    check (not provisional or open is false);

comment on column model_classifications.provisional is
  'True when closed was applied as the default for a model whose weights could not be found (stealth, or announced and unshipped), not as a verified negative; the watcher re-checks these until a human firms the verdict';

-- The watch list, read by the watcher every sweep and by the admin page.
create index if not exists model_classifications_provisional_idx
  on model_classifications (classified_at)
  where provisional;

alter table openrouter_lab_classifications
  add column if not exists provisional boolean not null default false,
  add constraint openrouter_lab_classifications_provisional_is_non_chinese
    check (not provisional or is_chinese is false);

comment on column openrouter_lab_classifications.provisional is
  'True when non-Chinese was applied as the default for an anonymous or unlocated publisher (denominator only, as for OpenRouter cloaked slugs), not as a verified placement; re-checked until a human firms the verdict';

create index if not exists openrouter_lab_classifications_provisional_idx
  on openrouter_lab_classifications (classified_at)
  where provisional;

commit;

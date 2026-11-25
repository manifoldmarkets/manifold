# Trophy badge art

Each milestone has one image: a polished "premium collectible" subject (enamel, metal, gems) on a transparent background. The page draws the tier-coloured circle, glow and ring around it in code (`trophy-card.tsx`, `profile-showcase.tsx`), so the art stays the same if tier colours change. Every milestone must have art: `common/src/trophies-art.test.ts` fails CI otherwise. The emoji only shows if an image fails to load.

| File                                                          | What                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `web/public/trophy-badges/<trophyId>/<milestoneId>.webp`      | The served images, 256 px (`getTrophyBadgeImagePath` in `common/src/trophies.ts`)                       |
| `web/public/trophy-badges/<trophyId>/{super,mega,crown}.webp` | Held rank-tier pins of the ranked trophies (`getTrophyRankBadgeImagePath`); no milestone uses these ids |
| `web/public/achievement-badges/<key>.webp`                    | The achievements grid on the Trophies tab (256 px). The large PNGs beside them are the press kit's      |
| `badge-art-manifest.json`                                     | Every milestone's subject: what each image shows                                                        |
| `badge-art-brief.md`                                          | The brief given to the image model: style, transparency, file layout                                    |
| `convert-badge-art.cjs`                                       | Turns the generated 1024 px PNGs into the served WebP files                                             |

## How the current set was made (25 Nov 2026)

By GPT (gpt-6.2-astra) through the Codex CLI's built-in image generation (`image_gen`): an 8-image pilot across tiers and subject types, then batches of 20–29. The model looked at each image and regenerated any with text, a background, a cartoonish look or the wrong subject. The same run made 40 more candidate tiers that aren't in the ladders yet, the 21 rank pins (Super in platinum with a laurel, Mega in gold with gems, #1 in opal with a crown) and the 20 achievement badges (one neutral platinum palette, since the grid's rank buckets supply the colour). The earlier clay-style set (22 Nov) is in git history.

```sh
# In an empty folder holding badge-art-brief.md and a batch file, e.g. batch.json:
codex exec --skip-git-repo-check -m gpt-6.2-astra -c model_reasoning_effort=medium \
  -s workspace-write - < badge-art-brief.md
# Images land in out/<trophyId>/<milestoneId>.png; then, from the repo root:
node dev-docs/trophies/convert-badge-art.cjs <that folder>/out
```

Point the brief at the batch file in place of `badge-art-manifest.json`. Codex writes only inside the folder it runs in.

## Adding a milestone

1. Add its subject to `badge-art-manifest.json`: one clear object or creature, no text, readable at 20 px in the showcase pill.
2. Generate it with the brief, convert it, and check it on its tier circle in both themes. The art test fails until the image is committed.
3. A new ranked trophy also needs its three rank pins; the art test checks them too.

## Style rules

- Refined 3D render with real materials (brushed and polished metal, enamel, glass, gems); dignified, not cartoonish: no faces or expressions on objects.
- One subject, centred, about 75–80% of the frame, three-quarter view, soft studio light from the top left.
- Accent material by tier: green emerald, blue sapphire, purple amethyst, crimson ruby, gold warm polished gold, prismatic iridescent opal. Higher tiers look more precious.
- Real transparency: no floor, backdrop or shadow under the subject, no border or ring, no text.

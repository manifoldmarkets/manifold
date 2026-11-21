# Trophy badge art

Each milestone has one image: a 3D clay-style subject on a transparent background. The page draws the tier-coloured circle, glow and ring around it in code (`trophy-card.tsx`, `profile-showcase.tsx`), so the art stays the same if tier colours change. A milestone without art shows its emoji.

| File                                                     | What                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `web/public/trophy-badges/<trophyId>/<milestoneId>.webp` | The served images, 256 px (`getTrophyBadgeImagePath` in `common/src/trophies.ts`) |
| `badge-art-manifest.json`                                | Every milestone's subject: what each image shows                                  |
| `badge-art-brief.md`                                     | The brief given to the image model: style, transparency, file layout              |
| `convert-badge-art.cjs`                                  | Turns the generated 1024 px PNGs into the served WebP files                       |

## How the current set was made (22 Nov 2026)

By GPT through the Codex CLI's built-in image generation (`image_gen`), in four batches: a 7-image pilot across all six tiers, then about 29 at a time. The model looked at each image and regenerated any with text, a background or the wrong subject.

```sh
# In an empty folder holding badge-art-brief.md and a batch file, e.g. batch-a.json:
codex exec --skip-git-repo-check -m gpt-6.2-astra -c model_reasoning_effort=medium \
  -s workspace-write - < badge-art-brief.md
# Images land in out/<trophyId>/<milestoneId>.png; then, from the repo root:
node dev-docs/trophies/convert-badge-art.cjs <that folder>/out
```

Point the brief at the batch file in place of `badge-art-manifest.json`. Codex writes only inside the folder it runs in.

## Adding a milestone

1. Add its subject to `badge-art-manifest.json`: one clear object or creature, no text, readable at 20 px in the showcase pill.
2. Generate it with the brief, convert it, and check it on its tier circle in both themes. The emoji shows until the image exists.

## Style rules

- One subject, centred, about 80% of the frame, soft studio light from the top left.
- Accent colour by tier: green emerald, blue sapphire, purple amethyst, crimson ruby, gold amber, prismatic iridescent.
- Real transparency: no floor, backdrop or shadow under the subject, no border or ring, no text.

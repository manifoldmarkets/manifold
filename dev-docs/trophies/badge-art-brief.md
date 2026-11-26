# Clay v3 production brief

Use the built-in image generation tool once per asset. Read the trophy's ordered `assets` and `series` in `badge-art-manifest.json`. Inspect the existing WebPs marked `keep` as visual references.

## Clay and light

Render one centred, slightly glossy 3D clay subject on a square 1024 × 1024 transparent canvas. Fill 75–80% of the frame. Use rounded shapes, a simple silhouette and soft studio lighting from the top left. Keep shadows on the subject. The site supplies the circular field and ring. Keep the image free of floors, backdrops, cast shadows, borders, lettering, numbers and logos. Use friendly expressions unless the subject calls for a serious one, as Terminator does.

Use subtle rim light in the tier accent. Green is emerald, teal is turquoise, blue is sapphire, indigo is deep indigo, purple is amethyst, pink is rose, crimson is ruby, orange is amber orange, gold is warm gold and prismatic has an iridescent rainbow sheen.

## Building a series

Work from the first milestone to the last. Match the preceding image's motif, camera angle, proportions, material and lighting. Develop the subject at each step so that its place in the sequence is clear and the top milestone is unmistakably the grandest. For Net Worth, for example, two bubbles beside a minnow grow into a towering spout over a breaching whale.

For each of the seven trophies in `rankPins.trophies`, use its finished top subject as the reference for all three rank pins. Follow `rankPins.tiers` for the silver star and sparkles on Super, golden star and aura on Mega, and clearly visible golden crown on #1.

## Delivery

1. Generate each subject in order, skipping existing output and assets marked `keep`.
2. Inspect it at 112 px and beside the preceding step. Retry once with a targeted correction for a wrong or clipped subject, text, an opaque background or a break in the series.
3. Save the transparent PNG as `out/<trophyId>/<milestoneId>.png`. Use `super.png`, `mega.png` and `crown.png` for rank pins in the same directory.

Report each saved path and any retries, followed by the number saved out of the requested total.

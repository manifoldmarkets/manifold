You are making badge art for "trophies" on Manifold, a prediction-market website. Each trophy milestone gets one square image, shown small (about 112 px) inside a circular badge whose ring and background are drawn in code with the milestone's tier colour. So each image is only the subject, on a transparent background.

Use your built-in image generation tool (`image_gen`), one call per asset. Do not write SVG, HTML, canvas or Python image code instead.

## Style (identical for every image, so the set looks like one family)

- 3D clay render, cute and friendly cartoon style, soft rounded shapes, slightly glossy.
- One clear subject, centred, filling about 75–80% of the frame, readable at 112 px. Simple silhouette, no tiny details.
- Soft studio lighting from the top left, gentle shadow on the subject itself only.
- A subtle rim light and accent colour matching the tier:
  - green: emerald green
  - blue: sapphire blue
  - purple: amethyst violet
  - crimson: ruby red
  - gold: warm gold and amber
  - prismatic: iridescent rainbow sheen
- Fully transparent background (real alpha). No floor, no backdrop, no drop shadow under the subject, no border, no ring, no frame.
- No text, letters, numbers or logos anywhere in the image.
- Square, 1024 × 1024.

## The assets

The file `badge-art-manifest.json` (or a file with a subset of its entries) in the current directory lists the assets as JSON: `trophyId`, `milestoneId`, `name` (the milestone's name, for context), `tier`, and `subject` (what to draw). Draw the `subject` in the style above, with the tier's accent colour. Where the subject mentions a background colour, ignore that and keep the background transparent.

For each asset:

1. Generate the image.
2. Look at it. If the subject is wrong, there is text, the background isn't transparent, or the subject is cut off, generate it once more with a targeted fix.
3. Copy the final image to `out/<trophyId>/<milestoneId>.png` under the current directory (create folders as needed). Never overwrite an existing file there; if one exists, skip that asset.

Work through every asset in the file. Don't stop early, and don't ask questions.

At the end, print a table: milestoneId, saved path, and "retried" if you regenerated it. Then a line `Saved: <n> of <total>`.

You are making badge art for "trophies" on Manifold, a prediction-market website. Each trophy milestone gets one square image, shown small (about 112 px, and as small as 20 px in a profile pill) inside a circular badge whose ring and background are drawn in code with the milestone's tier colour. So each image is only the subject, on a transparent background.

Use your built-in image generation tool (`image_gen`), one call per asset. Do not write SVG, HTML, canvas or Python image code instead.

## Style: "premium collectible" (identical for every image, so the set looks like one family)

This replaces an earlier cute clay-cartoon style. The new look is more polished and grown-up, like high-end achievement icons in a premium app or game, or a set of collectible enamel-and-metal pins:

- Refined 3D render with realistic materials: brushed and polished metal, glossy enamel, glass, matte ceramic, fine stone. Subtle bevels and crisp edges.
- Stylised but dignified: sleek, proportioned shapes. No cartoon faces, no googly eyes, no smiles or expressions on objects. Animals and creatures look majestic and graceful, not chibi or cute.
- One clear subject, centred, three-quarter view, filling about 75–80% of the frame, with a strong simple silhouette that still reads at 20 px. No tiny details.
- Soft studio lighting from the top left, a gentle rim light, shading on the subject only.
- The tier's accent colour is the main accent material (an enamel inlay, a tinted metal, a gem, or a glow), on an otherwise restrained palette:
  - green: emerald green
  - blue: sapphire blue
  - purple: amethyst violet
  - crimson: ruby red
  - gold: warm polished gold
  - prismatic: iridescent opal / holographic rainbow sheen, the most precious-looking material in the set
- Higher tiers look more precious and elaborate than lower ones (more metal, gems, finer finish), but always one subject.
- Fully transparent background (real alpha). No floor, no backdrop, no drop shadow under the subject, no border, no ring, no frame, no medal disc behind the subject unless the subject itself is a medal.
- No text, letters, numbers or logos anywhere in the image.
- Square, 1024 × 1024.

## The assets

The file `badge-art-manifest.json` (or a file with a subset of its entries, e.g. `batch.json`) in the current directory lists the assets as JSON: `trophyId`, `milestoneId`, `name` (the milestone's name, for context), `tier`, and `subject` (what to draw). Draw the `subject` in the style above, with the tier's accent colour.

For each asset:

1. Generate the image.
2. Look at it. If the subject is wrong, it looks cartoonish or cute, there is text, the background isn't transparent, or the subject is cut off, generate it once more with a targeted fix.
3. Copy the final image to `out/<trophyId>/<milestoneId>.png` under the current directory (create folders as needed). Never overwrite an existing file there; if one exists, skip that asset.

Work through every asset in the file. Don't stop early, and don't ask questions.

At the end, print a table: milestoneId, saved path, and "retried" if you regenerated it. Then a line `Saved: <n> of <total>`.

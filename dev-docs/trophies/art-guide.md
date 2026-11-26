# Trophy badge art

Each trophy forms an ordered series of clay subjects. Generate the milestones lowest first, keeping the motif, camera angle, proportions and lighting consistent as the subject grows more impressive. Use the trophy's series note and previously finished images for reference. The top milestone anchors its Super, Mega and #1 pins.

| File                      | Purpose                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `badge-art-manifest.json` | Ordered milestone subjects, series notes, retained clay references and rank-pin subjects |
| `badge-art-brief.md`      | Clay v3 material, composition, tier accents and review instructions                      |
| `convert-badge-art.cjs`   | Converts transparent 1024 px PNGs into the 256 px WebPs served by the site               |

## Producing and checking a badge

1. Follow the brief for the series. Keep one clear subject on real transparency. The site draws the tier colour, ring and glow. Assets marked `keep` are existing clay images.
2. Save source PNGs under `out/<trophyId>/`, then run `node dev-docs/trophies/convert-badge-art.cjs <path-to-out>` from the repo root.
3. Check the result on its tier circle in light and dark themes, both on the card and at the 20 px showcase size. Compare it with the steps on either side.
4. Run the common trophy tests. Every milestone needs `web/public/trophy-badges/<trophyId>/<milestoneId>.webp`. Each ranked trophy also needs `super.webp`, `mega.webp` and `crown.webp` in that directory. When an image fails to load, the badge displays the milestone emoji.

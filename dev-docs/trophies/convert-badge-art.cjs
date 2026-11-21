// Converts generated badge art into the files the site serves.
//
//   node dev-docs/trophies/convert-badge-art.cjs <source dir>
//
// <source dir> holds <trophyId>/<milestoneId>.png (1024 px, transparent
// background), as image generation saves them (see art-guide.md). Writes
// web/public/trophy-badges/<trophyId>/<milestoneId>.webp: 256 px, enough for
// the 96 px card image on a 2x or 3x screen. Run from the repo root; it uses
// web's sharp.
const fs = require('fs')
const path = require('path')
const sharp = require(require.resolve('sharp', {
  paths: [path.resolve('web')],
}))

const SIZE = 256
const [source] = process.argv.slice(2)
if (!source) {
  console.error(
    'usage: node dev-docs/trophies/convert-badge-art.cjs <source dir>'
  )
  process.exit(1)
}
const target = path.resolve('web/public/trophy-badges')

;(async () => {
  let count = 0
  let bytes = 0
  for (const trophyId of fs.readdirSync(source)) {
    const dir = path.join(source, trophyId)
    if (!fs.statSync(dir).isDirectory()) continue
    fs.mkdirSync(path.join(target, trophyId), { recursive: true })
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.png')) continue
      const out = path.join(target, trophyId, file.replace(/\.png$/, '.webp'))
      const info = await sharp(path.join(dir, file))
        .resize(SIZE, SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: 82, alphaQuality: 90, effort: 6 })
        .toFile(out)
      count++
      bytes += info.size
    }
  }
  console.log(`${count} images, ${(bytes / 1024).toFixed(0)} KB in ${target}`)
})()

// Circle-crop trophy subject images to transparent PNGs
// Usage: npx ts-node scripts/composite-badge.ts
//
// Reads from: web/public/trophy-badges/[trophy-id]/[milestone].png
// Outputs:    web/public/trophy-badges/[trophy-id]/[milestone].png (overwrites with circle-cropped version)

import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

const OUTPUT_SIZE = 512

async function circleCrop(inputPath: string, outputPath: string) {
  const radius = OUTPUT_SIZE / 2
  const mask = Buffer.from(
    `<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  )

  await sharp(inputPath)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(outputPath)

  console.log(`Circle-cropped: ${outputPath}`)
}

// Process all subject images in trophy-badges/
const baseDir = path.resolve(__dirname, '../web/public/trophy-badges')

const trophyDirs = fs
  .readdirSync(baseDir)
  .filter((d) => {
    const full = path.join(baseDir, d)
    return fs.statSync(full).isDirectory() && d !== 'borders'
  })

async function run() {
  for (const dir of trophyDirs) {
    const dirPath = path.join(baseDir, dir)
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.png'))
    for (const file of files) {
      const inputPath = path.join(dirPath, file)
      // Write to a temp file first, then rename (can't read+write same file)
      const tmpPath = inputPath + '.tmp.png'
      await circleCrop(inputPath, tmpPath)
      fs.renameSync(tmpPath, inputPath)
    }
  }
}

run().catch(console.error)

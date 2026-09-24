/**
 * Сводка расхождений последнего прогона: для каждого упавшего снимка — число отличающихся
 * пикселей и их области (склеенные по строкам полосы), чтобы быстро найти элемент.
 * Запуск: node visual/tools/diff-report.mjs
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const root = join(import.meta.dirname, '..', 'test-results')

const pairs = []
for (const dir of readdirSync(root)) {
  const full = join(root, dir)
  if (!statSync(full).isDirectory()) continue
  for (const file of readdirSync(full)) {
    if (file.endsWith('-actual.png')) pairs.push([dir, join(full, file), join(full, file.replace('-actual', '-expected'))])
  }
}

for (const [dir, actualPath, expectedPath] of pairs) {
  const a = await sharp(actualPath).raw().toBuffer({ resolveWithObject: true })
  const e = await sharp(expectedPath).raw().toBuffer({ resolveWithObject: true })
  const name = actualPath.split('/').pop().replace('-actual.png', '')
  if (a.info.width !== e.info.width || a.info.height !== e.info.height) {
    console.log(`${dir.slice(-24)} ${name}: размер ${a.info.width}x${a.info.height} вместо ${e.info.width}x${e.info.height}`)
    continue
  }
  const { width, height, channels } = a.info
  const rows = new Map()
  let total = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (a.data[i] !== e.data[i] || a.data[i + 1] !== e.data[i + 1] || a.data[i + 2] !== e.data[i + 2]) {
        total++
        const r = rows.get(y) || [x, x]
        rows.set(y, [Math.min(r[0], x), Math.max(r[1], x)])
      }
    }
  }
  const bands = []
  for (const y of [...rows.keys()].sort((p, q) => p - q)) {
    const [x0, x1] = rows.get(y)
    const last = bands[bands.length - 1]
    if (last && y - last.y1 <= 2) Object.assign(last, { y1: y, x0: Math.min(last.x0, x0), x1: Math.max(last.x1, x1) })
    else bands.push({ y0: y, y1: y, x0, x1 })
  }
  console.log(`${dir.slice(-24)} ${name}: ${total}px ` + bands.map((b) => `[x${b.x0}-${b.x1} y${b.y0}-${b.y1}]`).join(' '))
}

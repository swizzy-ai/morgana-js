// Write vocabulary.json from the make and set methods (see vocabulary-core.mjs).
//
//   node scripts/vocabulary.mjs          write vocabulary.json
//   node scripts/vocabulary.mjs --check  fail if vocabulary.json is out of date
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generate } from './vocabulary-core.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'vocabulary.json')
const text = generate()
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  if (current !== text) {
    console.error('vocabulary.json is out of date: run `node scripts/vocabulary.mjs` in packages/helpers.')
    process.exit(1)
  }
  console.log('vocabulary.json is up to date')
} else {
  fs.writeFileSync(target, text)
  const json = JSON.parse(text)
  console.log(`vocabulary.json: ${Object.keys(json.make).length} make words, ${Object.keys(json.set).length} set words`)
}

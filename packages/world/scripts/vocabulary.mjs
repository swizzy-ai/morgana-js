// Writes vocabulary.json: the world's nouns, words and full handle trees, for Godtongue and agents.
import fs from 'node:fs'
import { vocabulary } from '../dist/index.js'
fs.writeFileSync(new URL('../vocabulary.json', import.meta.url), JSON.stringify(vocabulary(), null, 2) + '\n')

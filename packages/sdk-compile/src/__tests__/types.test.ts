/**
 * `morgana types` — the three generated declaration files, written only on
 * change, and pruned when their source goes away.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { generateTypes } from '../types'

let dir = ''
const write = (rel: string, src: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), src)
}
const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8')

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

function project() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-types-'))
  write('package.json', '{"name":"t","type":"module"}')
  write(
    'src/actions/server/greet.ts',
    `export interface Contract { input: { name: string }; output: { message: string } }
export const greet = { handler: async () => ({ message: 'hi' }) }
`,
  )
  write(
    'src/objects/video-player.ts',
    `export default { name: 'video-player', defaultProps: { src: '' } }
`,
  )
}

describe('generateTypes', () => {
  it('writes the action registry, object registry and custom ui creators', async () => {
    project()
    const r = await generateTypes({ dir })

    expect(r.actions).toEqual(['greet'])
    expect(r.customObjects).toEqual(['videoPlayer'])
    expect(r.written.sort()).toEqual(['.morgana/fonts.d.ts', '.morgana/objects.d.ts', '.morgana/types/registry.d.ts', '.morgana/ui.d.ts'])

    expect(read('.morgana/types/registry.d.ts')).toContain('"greet": ActionContract<{ name: string; }, { message: string; }>')
    expect(read('.morgana/ui.d.ts')).toContain('"videoPlayer": CustomCreatable<typeof __c0>')
    expect(read('.morgana/ui.d.ts')).toContain('from "./../src/objects/video-player"')
    expect(read('.morgana/objects.d.ts')).toContain('interface ObjectRegistry {')
  })

  it('writes nothing when nothing changed — dev watches the project', async () => {
    project()
    await generateTypes({ dir })
    const again = await generateTypes({ dir })
    expect(again.written).toEqual([])
  })

  it('drops a custom object whose file is gone', async () => {
    project()
    await generateTypes({ dir })
    fs.rmSync(path.join(dir, 'src/objects/video-player.ts'))
    const r = await generateTypes({ dir })
    expect(r.customObjects).toEqual([])
    expect(r.written).toEqual(['.morgana/ui.d.ts'])
    expect(read('.morgana/ui.d.ts')).not.toContain('videoPlayer')
  })
})

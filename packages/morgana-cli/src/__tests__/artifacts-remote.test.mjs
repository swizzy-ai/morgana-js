/**
 * Sending artifacts: what a deploy uploads, and what it does when the worker
 * is older than the artifact store. The fetch here is a fake that records
 * requests, so these pin the protocol the worker tests pin from the other side.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { artifactMap, collectArtifactFiles, planArtifacts, uploadArtifacts } from '../lib/artifacts-remote.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')

function dist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-art-'))
  const art = path.join(dir, 'assets', '_artifacts', 'assets')
  fs.mkdirSync(path.join(art, 'aaa111'), { recursive: true })
  fs.mkdirSync(path.join(art, 'bbb222'), { recursive: true })
  fs.writeFileSync(path.join(art, 'aaa111', 'robot.glb'), 'glTF-robot')
  fs.writeFileSync(path.join(art, 'bbb222', 'heart.svg'), '<svg/>')
  // Same bytes under a second path: stored once.
  fs.writeFileSync(path.join(art, 'bbb222', 'heart.copy.svg'), '<svg/>')
  fs.writeFileSync(path.join(dir, 'assets', '_artifacts', 'manifest.json'), '{}')
  fs.writeFileSync(path.join(dir, 'assets', 'client.js'), 'x')
  return dir
}

function fakeFetch(handler) {
  const calls = []
  const fn = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    return handler(String(url), init)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('artifacts on the way to the worker', () => {
  it('collects every artifact file except the manifest, keyed by public path, with its own sha', () => {
    const files = collectArtifactFiles(dist())
    expect(files.map((f) => f.key)).toEqual([
      'assets/_artifacts/assets/aaa111/robot.glb',
      'assets/_artifacts/assets/bbb222/heart.copy.svg',
      'assets/_artifacts/assets/bbb222/heart.svg',
    ])
    expect(files[0]).toMatchObject({ sha: sha('glTF-robot'), contentType: 'model/gltf-binary', size: 10 })
    expect(artifactMap(files)['assets/_artifacts/assets/bbb222/heart.svg']).toEqual({ sha: sha('<svg/>'), size: 6, contentType: 'image/svg+xml' })
  })

  it('asks once which shas are missing, then uploads each missing file once', async () => {
    const files = collectArtifactFiles(dist())
    const calls = fakeFetch((url, init) => {
      if (url.endsWith('/api/artifacts/check')) return new Response(JSON.stringify({ success: true, missing: [sha('<svg/>')] }))
      return new Response(JSON.stringify({ success: true }))
    })
    const plan = await planArtifacts({ base: 'http://w', bearer: 'tok', projectId: 'p', files })
    expect(plan).toEqual({ supported: true, missing: [sha('<svg/>')] })
    expect(JSON.parse(calls[0].body).shas).toHaveLength(2) // duplicates asked about once

    const up = await uploadArtifacts({ base: 'http://w', bearer: 'tok', projectId: 'p', files, missing: plan.missing })
    expect(up).toEqual({ uploaded: 1, bytes: 6 })
    const put = calls.find((c) => c.method === 'PUT')
    expect(put.url).toBe(`http://w/api/artifacts/${sha('<svg/>')}?projectId=p`)
    expect(put.headers).toMatchObject({ authorization: 'Bearer tok', 'content-type': 'application/octet-stream', 'x-artifact-type': 'image/svg+xml' })
  })

  it('reports an older worker as unsupported, so the deploy falls back to sending files inline', async () => {
    fakeFetch(() => new Response('{"success":false,"message":"Not found"}', { status: 404 }))
    const plan = await planArtifacts({ base: 'http://old', bearer: 'tok', projectId: 'p', files: collectArtifactFiles(dist()) })
    expect(plan.supported).toBe(false)
  })

  it('says to sign in when the worker refuses the credential', async () => {
    fakeFetch(() => new Response('{"success":false,"message":"Not a member of this project"}', { status: 403 }))
    await expect(planArtifacts({ base: 'http://w', bearer: 'bad', projectId: 'p', files: collectArtifactFiles(dist()) }))
      .rejects.toThrow('artifact check → 403 Not a member of this project — run `morgana login`')
  })

  it('stops with the file name when an upload fails', async () => {
    fakeFetch((url) => url.endsWith('/check')
      ? new Response(JSON.stringify({ success: true, missing: [sha('glTF-robot')] }))
      : new Response('{"success":false,"message":"the body\'s sha256 is x"}', { status: 400 }))
    const files = collectArtifactFiles(dist())
    const plan = await planArtifacts({ base: 'http://w', bearer: 't', projectId: 'p', files })
    await expect(uploadArtifacts({ base: 'http://w', bearer: 't', projectId: 'p', files, missing: plan.missing }))
      .rejects.toThrow('uploading assets/_artifacts/assets/aaa111/robot.glb → 400')
  })

  it('has nothing to do for a project without artifacts', async () => {
    const calls = fakeFetch(() => new Response('{}'))
    expect(await planArtifacts({ base: 'http://w', bearer: 't', projectId: 'p', files: [] })).toEqual({ supported: true, missing: [] })
    expect(calls).toHaveLength(0)
  })
})

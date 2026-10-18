/**
 * Sending plugin artifacts to the worker's artifact store.
 *
 * Every file is addressed by the SHA-256 of its own bytes. A push asks the
 * worker which of those it lacks (one request), then uploads only those, a few
 * at a time. The worker re-hashes every body and refuses a mismatch, so a
 * file can only ever land under its own name — which is also why two projects
 * that build the same file store it once.
 *
 * `deploy` and `artifacts push` both come through here.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Where artifact files live inside dist/assets. Everything under it except the manifest goes to the store. */
export const ARTIFACT_DIR = '_artifacts'

const TYPES = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ktx2': 'image/ktx2',
  '.bin': 'application/octet-stream',
}

export const contentTypeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * The artifact files a built `dist/` ships, keyed by their public path
 * (`assets/_artifacts/assets/1a2b…/robot.glb`). The manifest stays inline: it
 * is small and changes with every build.
 */
export function collectArtifactFiles(dist) {
  const root = path.join(dist, 'assets', ARTIFACT_DIR)
  const out = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (full !== path.join(root, 'manifest.json')) {
        const bytes = fs.readFileSync(full)
        const rel = path.relative(path.join(dist), full).split(path.sep).join('/')
        out.push({ key: rel, file: full, sha: sha256(bytes), size: bytes.byteLength, contentType: contentTypeOf(full) })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

/** The same list for files that sit somewhere else on disk (the cache), with their public keys given. */
export function describeFiles(entries) {
  return entries.map(({ key, file }) => {
    const bytes = fs.readFileSync(file)
    return { key, file, sha: sha256(bytes), size: bytes.byteLength, contentType: contentTypeOf(file) }
  })
}

/** path → { sha, size, contentType }: what a deploy sends instead of the files. */
export function artifactMap(files) {
  return Object.fromEntries(files.map((f) => [f.key, { sha: f.sha, size: f.size, contentType: f.contentType }]))
}

function headers(bearer, extra = {}) {
  return { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...extra }
}

/**
 * Which of these files the worker lacks.
 * `supported: false` means the worker has no artifact store (an older worker,
 * or one without R2), and the caller should fall back to sending files inline.
 */
export async function planArtifacts({ base, bearer, projectId, files }) {
  const shas = [...new Set(files.map((f) => f.sha))]
  if (!shas.length) return { supported: true, missing: [] }
  const res = await fetch(`${base}/api/artifacts/check`, {
    method: 'POST',
    headers: headers(bearer, { 'content-type': 'application/json' }),
    body: JSON.stringify({ projectId, shas }),
  })
  if (res.status === 404 || res.status === 501) return { supported: false, missing: shas }
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 || res.status === 403) throw new Error(`artifact check → ${res.status} ${body.message ?? ''} — run \`morgana login\``)
  if (!res.ok) throw new Error(`artifact check → ${res.status} ${body.message ?? ''}`)
  return { supported: true, missing: body.missing ?? [] }
}

/** Upload the missing files, `parallel` at a time. Returns how many bytes went up. */
export async function uploadArtifacts({ base, bearer, projectId, files, missing, parallel = 6, onUpload }) {
  const wanted = new Set(missing)
  const queue = []
  const seen = new Set()
  for (const f of files) {
    if (wanted.has(f.sha) && !seen.has(f.sha)) { seen.add(f.sha); queue.push(f) }
  }
  let bytes = 0
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const body = fs.readFileSync(f.file)
      const res = await fetch(`${base}/api/artifacts/${f.sha}?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        // Bytes as octet-stream, real type alongside: nothing on the way
        // should try to parse a .json artifact as the request body.
        headers: headers(bearer, { 'content-type': 'application/octet-stream', 'x-artifact-type': f.contentType }),
        body,
      })
      if (!res.ok) {
        const msg = await res.json().then((b) => b.message).catch(() => '')
        throw new Error(`uploading ${f.key} → ${res.status} ${msg}`)
      }
      bytes += f.size
      onUpload?.(f)
    }
  }
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, worker))
  return { uploaded: seen.size, bytes }
}

/** The live deploy's artifact map, from the worker. */
export async function remoteArtifacts({ base, bearer, projectId, envName }) {
  const res = await fetch(`${base}/api/artifacts?projectId=${encodeURIComponent(projectId)}&env=${encodeURIComponent(envName)}`, { headers: headers(bearer) })
  if (res.status === 404) throw new Error('this worker has no artifact store yet — it needs updating')
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`artifact list → ${res.status} ${body.message ?? ''}`)
  return body.artifacts ?? {}
}

export const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`)

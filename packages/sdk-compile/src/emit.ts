/**
 * Emit — writes the shippable `dist/` tree.
 *
 * dist/
 *   pages/<page>.html
 *   assets/client.js
 *   assets/style.css
 *   server/actions/<name>.js
 *   server/apis.json       (http routes only)
 *   server/triggers.json   (every other trigger: cron + backend events)
 *   server/stores.json
 *   manifest.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ProjectIR } from './ir'
import type { HttpRoute, Trigger } from './routes'

export interface EmitInputs {
  ir: ProjectIR
  entry: string
  /** Project asset dir to copy verbatim into dist/assets (optional). */
  assetsDir?: string | null
  pages: Record<string, string>
  clientJs: string
  css: string
  serverActions: Array<{ name: string; code: string }>
  apis: HttpRoute[]
  triggers: Trigger[]
  warnings: string[]
  /**
   * Channels declared during the compile lane, with their access rules.
   *
   * Shipped with the build so the worker can answer a subscription from one
   * lookup rather than asking an action to decide while the page waits. An
   * absent entry means the channel is open to the project, which is what lets a
   * runtime-created channel work with no declaration at all.
   */
  channels?: Record<string, { scope?: string; members?: string[]; access?: { action: string }; description?: string; __src?: string }>
  /** Whether the emitted JS was minified — recorded for tooling. */
  minify?: boolean
  /** Public vars from morgana.config.ts, shipped for ctx.vars. */
  vars?: Record<string, unknown>
  /** Custom object components this project ships, for tooling to read. */
  customObjects?: Array<{
    name: string
    render: string
    defaultProps: Record<string, unknown>
    state: Record<string, unknown>
    events: string[]
    description?: string
  }>
}

export interface EmitResult {
  outDir: string
  files: string[]
  hash: string
}

/** Copy a project asset dir verbatim (binary-safe), recording dist-relative paths. */
function copyDir(src: string, dest: string, files: string[], root: string): void {
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(src, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    const from = path.join(src, item.name)
    const to = path.join(dest, item.name)
    if (item.isDirectory()) {
      copyDir(from, to, files, root)
    } else if (item.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.copyFileSync(from, to)
      files.push(path.relative(root, to).split(path.sep).join('/'))
    }
  }
}

export function emitDist(outDir: string, inputs: EmitInputs): EmitResult {
  const files: string[] = []
  const write = (rel: string, content: string): void => {
    const full = path.join(outDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
    files.push(rel)
  }

  for (const [name, html] of Object.entries(inputs.pages)) {
    write(`pages/${name}.html`, html)
  }
  write('assets/client.js', inputs.clientJs)
  write('assets/style.css', inputs.css)
  if (inputs.assetsDir) copyDir(inputs.assetsDir, path.join(outDir, 'assets'), files, outDir)
  for (const a of inputs.serverActions) {
    write(`server/actions/${a.name}.js`, a.code)
  }
  write('server/apis.json', `${JSON.stringify(inputs.apis, null, 2)}\n`)
  write('server/triggers.json', `${JSON.stringify(inputs.triggers, null, 2)}\n`)
  write(
    'server/stores.json',
    `${JSON.stringify([...inputs.ir.stores.values()], null, 2)}\n`,
  )

  // Hash the emitted artefacts, not just their shape: flipping `minify` or
  // editing a browser handler changes the output while leaving every page and
  // route identical, and a cache that ignored that would serve stale code.
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        entry: inputs.entry,
        clientJs: inputs.clientJs,
        css: inputs.css,
        pages: inputs.pages,
        serverActions: inputs.serverActions,
        apis: inputs.apis,
        triggers: inputs.triggers,
        stores: [...inputs.ir.stores.values()],
        minify: inputs.minify ?? false,
      }),
    )
    .digest('hex')

  write(
    'manifest.json',
    `${JSON.stringify(
      {
        entry: inputs.entry,
        pages: [...inputs.ir.pages.values()].map((p) => ({ name: p.name, address: p.address, app: p.app })),
        apps: [...inputs.ir.apps.values()].map((a) => ({
          name: a.name,
          displayName: a.displayName,
          // Always emitted, so a reader never has to know that an absent `type`
          // means 'web'. `platform` stays absent for a web app rather than being
          // emitted as null.
          type: a.type ?? 'web',
          ...(a.platform ? { platform: a.platform } : {}),
          pages: a.pages,
        })),
        actions: inputs.serverActions.map((a) => a.name),
        // Declared channels and their access rules, so a subscription is answered from
        // the build rather than from a config lookup. Omitted when the project
        // declares none, which the worker reads as "no channel has a rule" — the
        // open default.
        //
        // `__src` is stripped: the captured function has already become the
        // generated access action, and a `toString()`ed body in the manifest
        // would be a second copy of the same code that can drift.
        ...(inputs.channels && Object.keys(inputs.channels).length
          ? {
              channels: Object.fromEntries(
                Object.entries(inputs.channels).map(([name, c]) => {
                  const { __src: _src, ...rest } = c as { __src?: string };
                  return [name, rest];
                }),
              ),
            }
          : {}),
        icons: [...inputs.ir.icons.entries()].map(([name, def]) => ({ name, ...def })),
        libraries: [...inputs.ir.libraries.values()],
        minify: inputs.minify ?? false,
        // Public vars are build-time constants and safe to ship. Private vars
        // never appear here — the runtime supplies those from its own env.
        // The component schema, so tooling can list and autocomplete custom
        // types without importing the modules. The functions stay in the bundle.
        customObjects: (inputs.customObjects ?? []).map((c) => ({
          name: c.name,
          render: c.render,
          defaultProps: c.defaultProps,
          state: c.state,
          events: c.events,
          description: c.description,
        })),
        vars: inputs.vars ?? {},
        hash,
        warnings: inputs.warnings,
        logs: inputs.ir.logs,
      },
      null,
      2,
    )}\n`,
  )

  files.sort()
  return { outDir, files, hash }
}

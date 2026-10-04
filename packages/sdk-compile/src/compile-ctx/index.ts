/**
 * Compile contexts: server lane (ui-free) and browser lane.
 *
 * `ctx.ui.<kind>(props)` creates an object and `ctx.ui.get(id)` looks one up —
 * one way to do each, on both lanes. There is no `ctx.objects`.
 */
import type { MorganaConfig } from '@morgana/sdk';
import { createEmptyIR } from '../ir';
import type { ChannelDecl } from '../ir';

/**
 * The channels surface, built once per context.
 *
 * Returned as a single object that is published under BOTH `ctx.events.channels`
 * and `ctx.channels`, so the two names are aliases of one implementation rather
 * than two that can drift. Splitting them would mean every method added to one
 * had to be remembered in the other, and a caller who used both would get two
 * objects with the same methods and no way to tell they were the same.
 */
function buildChannels(state: CompileState): Record<string, unknown> {
  return {
    list: () => [...state.ir.channels.values()],
    // Access is declared here, where the channel is created, and there are only
    // two ways to say it: an explicit member list, or a function that decides.
    // Anything absent means open to the project.
    create: (name: string, opts?: unknown) => {
      const o = (opts ?? {}) as {
        scope?: string
        members?: string[]
        description?: string
        permissions?: unknown
      };
      const scope = (typeof opts === 'string' ? opts : o.scope ?? 'public') as ChannelDecl['scope'];
      const permissions = o.permissions;
      if (permissions !== undefined && typeof permissions !== 'function') {
        throw new Error(
          `ctx.channels.create("${name}", { permissions: … }) takes a function, got ${typeof permissions}`,
        );
      }
      const existing = state.ir.channels.get(name);
      if (!existing) {
        state.ir.channels.set(name, {
          name,
          scope,
          ...(Array.isArray(o.members) && o.members.length ? { members: o.members } : {}),
          ...(o.description ? { description: o.description } : {}),
        });
      } else if (Array.isArray(o.members) && o.members.length && !existing.members) {
        // A second create() must not silently drop a declaration the first made.
        existing.members = o.members;
      }

      /**
       * The permission function, captured by source.
       *
       * It becomes a deployed action — one per project, dispatching on the channel
       * name — and the channel records that action's name. The subscription path
       * invokes it with an ordinary action context, so the decision can read
       * `ctx.auth.user`, query a store, or do anything else. That is the point: the
       * rule is code, not a variant this framework has to anticipate.
       *
       * Because the function is serialised it must be self-contained; a closure over
       * a module-level binding serialises as a reference to a name nothing defines.
       * `accessModuleWarnings` turns that into a build warning rather than a room
       * nobody can enter.
       */
      const channel = state.ir.channels.get(name) as ChannelDecl;
      if (typeof permissions === 'function') {
        channel.__src = (permissions as (...a: unknown[]) => unknown).toString();
        channel.access = { action: ACCESS_ACTION };
        // A member list and a permission function are two ways to answer the same
        // question; carrying both would leave the precedence to a reader. The
        // function is the later and more expressive of the two.
        delete channel.members;
      }
      return channel;
    },
  };
}

/** The generated action every channel's permission function is emitted into. */
const ACCESS_ACTION = '__channel_access';
import type { CompileState } from './handles';
import { buildApps, buildUi, buildVars } from './registries';

export type { CompileState } from './handles';

export function buildServerCompileCtx(state: CompileState): Record<string, unknown> {
  // Built once and published under both names — see buildChannels.
  const __channels = buildChannels(state);
  return {
    args: {},
    vars: buildVars(state),
    apps: buildApps(state),
    actions: {
      run: () => {
        throw new Error('ctx.actions.run() is runtime-only — not available in compile actions')
      },
    },
    assets: { url: (n: string) => `/assets/${n}`, get: () => null },
    ai: {
      generateText: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
      generateObject: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
      text: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
    },
    log: Object.assign((...parts: unknown[]) => state.ir.logs.push(parts.map(String).join(' ')), {
      info: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
      warn: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
      error: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
    }),
    events: {
      on: () => () => {},
      emit: () => {},
      subscribe: () => () => {},
      publish: () => {},
      channels: __channels,
    },
    // Alias for `ctx.events.channels`. Same object, not a second implementation:
    // channels are reached often enough that the shorter name earns its place,
    // and pointing both at one surface is what keeps them from drifting apart.
    channels: __channels,
    server: {
      env: {},
      request: { method: 'BUILD', url: '/', path: '/', query: {}, headers: {}, body: null },
      respond: () => {},
      response: { status: () => {}, setHeader: () => {}, respond: () => {}, stream: () => {} },
      collections: {
        get: () => {
          throw new Error('collections.get is runtime-only in compile (use create/shape to declare)')
        },
        set: () => {
          throw new Error('collections.set is runtime-only in compile')
        },
        add: () => {
          throw new Error('collections.add is runtime-only in compile')
        },
        insert: () => {
          throw new Error('collections.insert is runtime-only in compile')
        },
        update: () => {
          throw new Error('collections.update is runtime-only in compile')
        },
        remove: () => {
          throw new Error('collections.remove is runtime-only in compile')
        },
        count: () => {
          throw new Error('collections.count is runtime-only in compile')
        },
        find: () => [],
        query: () => {
          throw new Error('collections.query is runtime-only in compile')
        },
        create: (name: string, shape?: unknown) => {
          state.ir.stores.set(name, { name, shape: shape ?? { columns: [] } })
          return state.ir.stores.get(name)?.shape
        },
        shape: (name: string) => state.ir.stores.get(name)?.shape ?? null,
      },
      files: {
        read: () => null,
        write: () => {
          throw new Error('files.write is runtime-only in compile')
        },
        update: () => {
          throw new Error('files.update is runtime-only in compile')
        },
        remove: () => false,
        list: () => [],
        stat: () => null,
      },
      queue: {
        push: () => {
          throw new Error('queue.push is runtime-only in compile')
        },
      },
    },
  }
}

/** Browser-compile ctx: the ClientContext shape, plus the `define` surface. */
export function buildBrowserCompileCtx(state: CompileState): Record<string, unknown> {
  // Built once and published under both names — see buildChannels.
  const __channels = buildChannels(state);
  return {
    args: {},
    vars: buildVars(state),
    apps: buildApps(state),
    actions: {
      run: () => {
        throw new Error('ctx.actions.run() is runtime-only — not available in compile actions')
      },
    },
    assets: { url: (n: string) => `/assets/${n}`, get: () => null },
    ai: {
      generateText: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
      generateObject: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
      text: () => {
        throw new Error('ctx.ai is runtime-only — not available in compile actions')
      },
    },
    log: Object.assign((...parts: unknown[]) => state.ir.logs.push(parts.map(String).join(' ')), {
      info: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
      warn: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
      error: (...p: unknown[]) => state.ir.logs.push(p.map(String).join(' ')),
    }),
    events: {
      on: () => () => {},
      emit: () => {},
      subscribe: () => () => {},
      publish: () => {},
      channels: __channels,
    },
    // Alias for `ctx.events.channels` — the same object, see above.
    channels: __channels,
    event: { name: 'compile', origin: 'compile', element: null, payload: {}, timestamp: Date.now() },
    ui: buildUi(state),
    libraries: {
      get: () => null,
      has: () => false,
      /** Compile-only: declare a JS library (CDN script for icon packs etc). */
      define: (name: string, ref: { cdnUrl: string; globalVar: string; version?: string }) => {
        if (!ref || typeof ref.cdnUrl !== 'string' || typeof ref.globalVar !== 'string') {
          throw new Error('ctx.libraries.define(name, { cdnUrl, globalVar }) requires cdnUrl and globalVar')
        }
        state.ir.libraries.set(name, { name, cdnUrl: ref.cdnUrl, globalVar: ref.globalVar, version: ref.version })
        return state.ir.libraries.get(name)
      },
    },
  }
}

export function createCompileState(config: MorganaConfig, actionName: string): CompileState {
  return { ir: createEmptyIR(), config, actionName }
}

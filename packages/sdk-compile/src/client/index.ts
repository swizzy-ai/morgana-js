/**
 * Client bundle composer — fixed part order, byte-stable output.
 */
import { bundleBrowserActions, bundleClientRuntime, type BundleOptions } from '../bundle';
import { actionsPart } from './actions';
import { behaviorsPart } from './behaviors';
import { busPart } from './bus';
import { debugPart } from './debug';
import { clickPart, formPart, pointerPart, windowPart } from './dom-events';
import { lifecyclePart } from './lifecycle';
import { routerPart } from './router';
import { statePart } from './state'
import { transportPart } from './transport';

export async function renderClientJs(
  projectDir: string,
  actions: BundleOptions[],
  bindings: Array<{ event: string; action: string; origin?: string; prop?: string }> = [],
  minify = false,
  customObjectsJs: string | null = null,
  /** The kinds the project uses: only their runtime code ships. All when absent. */
  kinds?: Set<string>,
): Promise<string> {
  // The runtime must exist before makeCtx is called, and author code must be
  // registered before the first dispatch — so: runtime, helpers, actions,
  // listeners, behaviors, lifecycle.
  const [runtime, bundle] = await Promise.all([
    bundleClientRuntime(projectDir, minify, kinds),
    bundleBrowserActions(projectDir, actions, minify),
  ]);
  const bindingsJson = JSON.stringify(bindings);
  return [
    '(function(){',
    'window.__morgana_actions = window.__morgana_actions || {};',
    // Components register before the runtime, so `makeUi` can resolve a
    // component's methods and lifecycle the first time it sees the object.
    ...(customObjectsJs ? [customObjectsJs] : []),
    ...statePart(),
    ...(runtime ? [runtime] : []),
    ...routerPart(),
    ...actionsPart(),
    ...(bundle ? [bundle] : []),
    ...clickPart(),
    // bus before transport: `transportPart` dispatches onto the page bus, so the
    // bus has to exist first. After bus, before the listeners below, so a frame
    // arriving during first paint still finds its subscriber.
    ...busPart(bindingsJson),
    ...transportPart(),
    ...formPart(),
    ...pointerPart(),
    ...windowPart(),
    ...behaviorsPart(kinds),
    ...lifecyclePart(),
    // Init router last, after everything else is ready
    'if(typeof initRouter!=="undefined") initRouter();',
    ...debugPart(),
    '})();',
    '',
  ].join('\n');
}

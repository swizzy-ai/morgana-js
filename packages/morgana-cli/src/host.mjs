/**
 * Host library entry — the reference host as an importable module.
 *
 * The CLI binary bundles `bin/morgana.mjs`; this entry exists for backend
 * packages (desktop-electron first). It re-exports the pieces a backend needs
 * to boot the app: `dev()` serves dist/ and runs actions, the CronScheduler
 * fires declarative schedules, the store engine and channel hub are here for
 * tooling. Nothing in this file knows about windows or installers — the
 * backend owns those, the host owns the project runtime.
 */
export { dev } from './commands/dev.mjs'
export { makeHostContext } from './lib/host-context.mjs'
export { CronScheduler, isValidCronExpression, cronMatchesAt } from './lib/cron.mjs'
export { StoreEngine } from './lib/store.mjs'
export { ChannelHub } from './lib/channels.mjs'

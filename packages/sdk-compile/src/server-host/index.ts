/**
 * Host capabilities shared by both server hosts — `morgana dev` (Node) and the
 * cloud worker (workerd). Worker-safe by construction: no compiler, no esbuild,
 * no `node:` imports. A capability that both hosts implement separately is two
 * capabilities that drift; the ones here are written once.
 */
export { createEmailHandle } from './email'
export type { EmailHandle, EmailHostDeps, EmailMessage, EmailResult } from './email'

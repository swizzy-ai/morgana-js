/**
 * `ctx.server.email` — transactional email for server actions.
 *
 * One implementation for both hosts: `morgana dev` (Node) and the cloud worker
 * build it from the same function, so an action that sends locally sends the
 * same way deployed. It is plain `fetch` against the provider's HTTP API —
 * no provider SDK, because those assume Node and the worker is not Node.
 *
 * Configuration is vars, the same place every other server setting lives:
 *
 *   RESEND_API_KEY   secret — `morgana secrets set RESEND_API_KEY re_…`
 *   EMAIL_FROM       default sender, e.g. `Acme <hello@acme.com>` (public var or secret)
 *   EMAIL_PROVIDER   `resend` (default) | `console` — `console` prints instead of
 *                    sending, for working on a sign-up flow without a key.
 *
 * Nothing falls back silently: no key and no `console` provider is an error
 * that names the secret to set, because an email that was "sent" to nowhere is
 * the failure a sign-up flow cannot afford.
 */

import type { EmailHandle, EmailMessage, EmailResult } from '@morgana/sdk'

export type { EmailHandle, EmailMessage, EmailResult }

export interface EmailHostDeps {
  /** Reads a var or secret — the host's merged `ctx.vars`. */
  getVar(name: string): unknown
  fetch?: typeof fetch
  /** Where the `console` provider writes. */
  log?: (line: string) => void
}

const RESEND_URL = 'https://api.resend.com/emails'

const list = (v: string | string[] | undefined): string[] | undefined =>
  v === undefined ? undefined : (Array.isArray(v) ? v : [v]).map((s) => String(s).trim()).filter(Boolean)

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function validate(message: EmailMessage, from: string): string[] {
  const to = list(message?.to) ?? []
  if (!to.length) throw new Error('ctx.server.email.send: `to` is required')
  if (to.length > 50) throw new Error('ctx.server.email.send: at most 50 recipients in `to`')
  if (!str(message.subject)) throw new Error('ctx.server.email.send: `subject` is required')
  if (!str(message.html) && !str(message.text)) {
    throw new Error('ctx.server.email.send: give `html`, `text`, or both')
  }
  if (!from) {
    throw new Error(
      'ctx.server.email.send: no sender — pass `from`, or set the EMAIL_FROM var ' +
        '(e.g. `morgana secrets set EMAIL_FROM "Acme <hello@acme.com>"`)',
    )
  }
  return to
}

export function createEmailHandle(deps: EmailHostDeps): EmailHandle {
  const doFetch = deps.fetch ?? fetch
  return {
    async send(message) {
      const provider = str(deps.getVar('EMAIL_PROVIDER')).toLowerCase() || 'resend'
      const from = str(message?.from) || str(deps.getVar('EMAIL_FROM'))
      const to = validate(message, from)

      if (provider === 'console') {
        const id = `console_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
        const body = str(message.text) || str(message.html)
        ;(deps.log ?? console.log)(
          `[email] ${id}\n  from:    ${from}\n  to:      ${to.join(', ')}\n  subject: ${message.subject}\n\n${body}\n`,
        )
        return { id, provider }
      }

      if (provider !== 'resend') {
        throw new Error(`ctx.server.email: unknown EMAIL_PROVIDER "${provider}" — use "resend" or "console"`)
      }
      const key = str(deps.getVar('RESEND_API_KEY'))
      if (!key) {
        throw new Error(
          'ctx.server.email: RESEND_API_KEY is not set — `morgana secrets set RESEND_API_KEY re_…` ' +
            '(add --local for morgana dev), or set EMAIL_PROVIDER=console to print instead of sending',
        )
      }

      const payload: Record<string, unknown> = {
        from,
        to,
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
        ...(list(message.cc) ? { cc: list(message.cc) } : {}),
        ...(list(message.bcc) ? { bcc: list(message.bcc) } : {}),
        ...(list(message.replyTo) ? { reply_to: list(message.replyTo) } : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.tags ? { tags: message.tags } : {}),
      }
      const res = await doFetch(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          ...(message.idempotencyKey ? { 'idempotency-key': message.idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      let data: { id?: string; message?: string; name?: string } = {}
      try {
        data = JSON.parse(text)
      } catch {
        data = { message: text.slice(0, 300) }
      }
      if (!res.ok || !data.id) {
        throw new Error(`ctx.server.email: Resend refused the message (${res.status}) ${data.message ?? data.name ?? ''}`.trim())
      }
      return { id: data.id, provider }
    },
  }
}

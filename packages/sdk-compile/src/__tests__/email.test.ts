import { describe, expect, it } from 'vitest'
import { createEmailHandle } from '../server-host'

function fakeFetch(status = 200, body: unknown = { id: 'msg_1' }) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { fn, calls }
}

const varsOf = (v: Record<string, string>) => (name: string) => v[name]

describe('ctx.server.email', () => {
  it('sends through Resend with the secret, default sender and mapped fields', async () => {
    const f = fakeFetch()
    const email = createEmailHandle({
      getVar: varsOf({ RESEND_API_KEY: 're_test', EMAIL_FROM: 'Acme <hi@acme.com>' }),
      fetch: f.fn,
    })
    const res = await email.send({
      to: 'a@x.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
      replyTo: 'support@acme.com',
      idempotencyKey: 'signup-42',
    })
    expect(res).toEqual({ id: 'msg_1', provider: 'resend' })
    expect(f.calls).toHaveLength(1)
    const { url, init } = f.calls[0]!
    expect(url).toBe('https://api.resend.com/emails')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer re_test')
    expect(headers['idempotency-key']).toBe('signup-42')
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Acme <hi@acme.com>',
      to: ['a@x.com'],
      subject: 'Welcome',
      html: '<p>hi</p>',
      reply_to: ['support@acme.com'],
    })
  })

  it('an explicit from beats EMAIL_FROM', async () => {
    const f = fakeFetch()
    await createEmailHandle({ getVar: varsOf({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@a.com' }), fetch: f.fn }).send({
      from: 'b@b.com',
      to: ['x@x.com'],
      subject: 's',
      text: 't',
    })
    expect(JSON.parse(String(f.calls[0]!.init.body)).from).toBe('b@b.com')
  })

  it('names the secret to set when the key is missing, and sends nothing', async () => {
    const f = fakeFetch()
    const email = createEmailHandle({ getVar: varsOf({ EMAIL_FROM: 'a@a.com' }), fetch: f.fn })
    await expect(email.send({ to: 'x@x.com', subject: 's', text: 't' })).rejects.toThrow(/RESEND_API_KEY/)
    expect(f.calls).toHaveLength(0)
  })

  it('validates before calling the provider', async () => {
    const f = fakeFetch()
    const email = createEmailHandle({ getVar: varsOf({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@a.com' }), fetch: f.fn })
    await expect(email.send({ to: [], subject: 's', text: 't' })).rejects.toThrow(/`to`/)
    await expect(email.send({ to: 'x@x.com', subject: '', text: 't' })).rejects.toThrow(/subject/)
    await expect(email.send({ to: 'x@x.com', subject: 's' })).rejects.toThrow(/html.*text/)
    await expect(
      createEmailHandle({ getVar: varsOf({ RESEND_API_KEY: 'k' }), fetch: f.fn }).send({ to: 'x@x.com', subject: 's', text: 't' }),
    ).rejects.toThrow(/EMAIL_FROM/)
    expect(f.calls).toHaveLength(0)
  })

  it('surfaces a provider refusal with its status and message', async () => {
    const f = fakeFetch(422, { name: 'validation_error', message: 'Invalid `from` field.' })
    const email = createEmailHandle({ getVar: varsOf({ RESEND_API_KEY: 'k', EMAIL_FROM: 'bad' }), fetch: f.fn })
    await expect(email.send({ to: 'x@x.com', subject: 's', text: 't' })).rejects.toThrow(/422.*Invalid `from`/)
  })

  it('console provider prints and never calls the network', async () => {
    const f = fakeFetch()
    const lines: string[] = []
    const res = await createEmailHandle({
      getVar: varsOf({ EMAIL_PROVIDER: 'console', EMAIL_FROM: 'a@a.com' }),
      fetch: f.fn,
      log: (l) => lines.push(l),
    }).send({ to: 'x@x.com', subject: 'Reset your password', text: 'code 123' })
    expect(res.provider).toBe('console')
    expect(f.calls).toHaveLength(0)
    expect(lines.join('\n')).toContain('Reset your password')
    expect(lines.join('\n')).toContain('code 123')
  })
})

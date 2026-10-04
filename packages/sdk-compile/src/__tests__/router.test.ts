/**
 * SPA router tests: URL param parsing, route matching, navigation.
 */
import { describe, it, expect } from 'vitest'
import { parseQuery, matchRoute, resolveRoute, type PageManifest } from '../client/router'

describe('parseQuery', () => {
  it('parses empty query string', () => {
    expect(parseQuery('')).toEqual({})
    expect(parseQuery('?')).toEqual({})
  })

  it('parses single param', () => {
    expect(parseQuery('?foo=bar')).toEqual({ foo: 'bar' })
    expect(parseQuery('foo=bar')).toEqual({ foo: 'bar' })
  })

  it('parses multiple params', () => {
    expect(parseQuery('?foo=bar&baz=qux')).toEqual({ foo: 'bar', baz: 'qux' })
  })

  it('decodes URL-encoded values', () => {
    expect(parseQuery('?name=John%20Doe&tag=hello%20world')).toEqual({
      name: 'John Doe',
      tag: 'hello world',
    })
  })

  it('handles params without values', () => {
    expect(parseQuery('?flag')).toEqual({ flag: '' })
    expect(parseQuery('?foo=bar&flag&baz=qux')).toEqual({ foo: 'bar', flag: '', baz: 'qux' })
  })

  it('handles empty values', () => {
    expect(parseQuery('?foo=')).toEqual({ foo: '' })
    expect(parseQuery('?foo=&bar=baz')).toEqual({ foo: '', bar: 'baz' })
  })
})

describe('matchRoute', () => {
  it('matches exact routes', () => {
    expect(matchRoute('/', '/')).toEqual({})
    expect(matchRoute('/home', '/home')).toEqual({})
    expect(matchRoute('/about', '/about')).toEqual({})
  })

  it('does not match different routes', () => {
    expect(matchRoute('/home', '/about')).toBeNull()
    expect(matchRoute('/user', '/admin')).toBeNull()
  })

  it('matches routes with trailing slashes', () => {
    expect(matchRoute('/home/', '/home')).toEqual({})
    expect(matchRoute('/home', '/home/')).toEqual({})
    expect(matchRoute('/home/', '/home/')).toEqual({})
  })

  it('extracts single path param', () => {
    expect(matchRoute('/user/:id', '/user/123')).toEqual({ id: '123' })
    expect(matchRoute('/post/:slug', '/post/hello-world')).toEqual({ slug: 'hello-world' })
  })

  it('extracts multiple path params', () => {
    expect(matchRoute('/posts/:category/:slug', '/posts/tech/hello-world')).toEqual({
      category: 'tech',
      slug: 'hello-world',
    })
    expect(matchRoute('/user/:id/posts/:postId', '/user/123/posts/456')).toEqual({
      id: '123',
      postId: '456',
    })
  })

  it('decodes param values', () => {
    expect(matchRoute('/user/:name', '/user/John%20Doe')).toEqual({ name: 'John Doe' })
  })

  it('returns null for wrong segment count', () => {
    expect(matchRoute('/user/:id', '/user')).toBeNull()
    expect(matchRoute('/user', '/user/123')).toBeNull()
    expect(matchRoute('/posts/:category/:slug', '/posts/tech')).toBeNull()
  })

  it('handles mixed literal and param segments', () => {
    expect(matchRoute('/api/user/:id', '/api/user/123')).toEqual({ id: '123' })
    expect(matchRoute('/api/user/:id/profile', '/api/user/123/profile')).toEqual({ id: '123' })
  })
})

describe('resolveRoute', () => {
  const manifest: PageManifest = {
    pages: {
      home: { address: '/' },
      about: { address: '/about' },
      user: { address: '/user/:id' },
      post: { address: '/posts/:category/:slug' },
      dashboard: { address: '/dashboard', isSpa: true, spaRoute: '/app/:section' },
    },
    page: 'home',
    address: '/',
  }

  it('resolves exact page matches', () => {
    const result = resolveRoute(manifest, '/', '')
    expect(result).toEqual({
      page: 'home',
      params: {},
      query: {},
      address: '/',
    })
  })

  it('resolves page with path params', () => {
    const result = resolveRoute(manifest, '/user/123', '')
    expect(result).toEqual({
      page: 'user',
      params: { id: '123' },
      query: {},
      address: '/user/:id',
    })
  })

  it('resolves page with multiple params', () => {
    const result = resolveRoute(manifest, '/posts/tech/hello-world', '')
    expect(result).toEqual({
      page: 'post',
      params: { category: 'tech', slug: 'hello-world' },
      query: {},
      address: '/posts/:category/:slug',
    })
  })

  it('includes query params in result', () => {
    const result = resolveRoute(manifest, '/about', '?ref=twitter&utm=campaign')
    expect(result).toEqual({
      page: 'about',
      params: {},
      query: { ref: 'twitter', utm: 'campaign' },
      address: '/about',
    })
  })

  it('merges path and query params', () => {
    const result = resolveRoute(manifest, '/user/456', '?tab=profile&edit=true')
    expect(result).toEqual({
      page: 'user',
      params: { id: '456' },
      query: { tab: 'profile', edit: 'true' },
      address: '/user/:id',
    })
  })

  it('resolves spaRoute override', () => {
    const result = resolveRoute(manifest, '/app/settings', '')
    expect(result).toEqual({
      page: 'dashboard',
      params: { section: 'settings' },
      query: {},
      address: '/app/:section',
    })
  })

  it('returns null for unknown route', () => {
    expect(resolveRoute(manifest, '/unknown', '')).toBeNull()
    expect(resolveRoute(manifest, '/user', '')).toBeNull()
  })

  it('prioritizes exact address match over spaRoute', () => {
    // If a page declares both address and spaRoute, address is checked first
    const result = resolveRoute(manifest, '/dashboard', '')
    expect(result?.page).toBe('dashboard')
    expect(result?.address).toBe('/dashboard')
  })
})

describe('router integration', () => {
  it('handles root path specially', () => {
    expect(matchRoute('/', '/')).toEqual({})
    expect(matchRoute('/', '/home')).toBeNull()
  })

  it('handles complex URLs', () => {
    const manifest: PageManifest = {
      pages: {
        docs: { address: '/docs/:version/:page' },
      },
      page: 'docs',
      address: '/docs/:version/:page',
    }

    const result = resolveRoute(manifest, '/docs/v2/getting-started', '?highlight=install')
    expect(result).toEqual({
      page: 'docs',
      params: { version: 'v2', page: 'getting-started' },
      query: { highlight: 'install' },
      address: '/docs/:version/:page',
    })
  })

  it('handles empty manifest gracefully', () => {
    const manifest: PageManifest = {
      pages: {},
      page: '',
      address: '/',
    }
    expect(resolveRoute(manifest, '/any', '')).toBeNull()
  })
})

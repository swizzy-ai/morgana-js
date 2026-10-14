/**
 * A minimal WebSocket server endpoint for `morgana dev` — enough for live
 * object subscriptions: the RFC 6455 handshake, server→client text frames,
 * and the client's close/ping frames. The cloud uses the Durable Object
 * hibernation API for the same protocol, so the browser code is one path.
 */
import crypto from 'node:crypto'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  const len = body.length
  const head =
    len < 126
      ? Buffer.from([0x80 | opcode, len])
      : len < 65536
        ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
        : (() => {
            const h = Buffer.alloc(10)
            h[0] = 0x80 | opcode
            h[1] = 127
            h.writeBigUInt64BE(BigInt(len), 2)
            return h
          })()
  return Buffer.concat([head, body])
}

/**
 * Complete the upgrade and return a small socket API, or null after
 * answering a bad request.
 */
export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key']
  if (!key || String(req.headers['upgrade'] ?? '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    return null
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )
  const closers = []
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    for (const fn of closers) fn()
    try {
      socket.end(frame(0x8, Buffer.alloc(0)))
    } catch {}
  }
  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f
      let len = buf[1] & 0x7f
      let off = 2
      if (len === 126) {
        if (buf.length < 4) return
        len = buf.readUInt16BE(2)
        off = 4
      } else if (len === 127) {
        if (buf.length < 10) return
        len = Number(buf.readBigUInt64BE(2))
        off = 10
      }
      const masked = (buf[1] & 0x80) !== 0
      const total = off + (masked ? 4 : 0) + len
      if (buf.length < total) return
      const mask = masked ? buf.subarray(off, off + 4) : null
      const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total))
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3]
      buf = buf.subarray(total)
      if (opcode === 0x8) return close()
      if (opcode === 0x9) socket.write(frame(0xa, data))
    }
  })
  socket.on('close', close)
  socket.on('error', close)
  return {
    send(text) {
      if (!closed) socket.write(frame(0x1, String(text)))
    },
    onClose(fn) {
      closers.push(fn)
    },
    close,
  }
}

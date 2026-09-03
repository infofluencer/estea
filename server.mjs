import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const port = Number(process.env.PORT) || 3020

const mime = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function safeFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const file = path.normalize(path.join(root, relative))
  if (!file.startsWith(root + path.sep) && file !== root) return null
  return file
}

function sendFile(req, res, file, stat) {
  const type = mime[path.extname(file)] || 'application/octet-stream'
  const size = stat.size
  const range = req.headers.range

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range)
    if (!match) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }

    const start = match[1] ? Number(match[1]) : 0
    const end = match[2] ? Number(match[2]) : size - 1
    if (start >= size || end >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      res.end()
      return
    }

    res.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    fs.createReadStream(file, { start, end }).pipe(res)
    return
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': path.extname(file) === '.html'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer((req, res) => {
  const file = safeFile(req.url || '/')
  if (!file) {
    res.writeHead(403)
    res.end()
    return
  }

  fs.stat(file, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(req, res, file, stat)
      return
    }

    const ext = path.extname(file)
    if (ext && ext !== '.html') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    const index = path.join(root, 'index.html')
    fs.stat(index, (indexErr, indexStat) => {
      if (indexErr) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      sendFile(req, res, index, indexStat)
    })
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Es Çay listening on 0.0.0.0:${port}`)
})

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
  if (!file.startsWith(root)) return null
  return file
}

const server = http.createServer((req, res) => {
  const file = safeFile(req.url || '/')
  if (!file) {
    res.writeHead(403)
    res.end()
    return
  }

  fs.stat(file, (err, stat) => {
    const target = !err && stat.isFile() ? file : path.join(root, 'index.html')
    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      const type = mime[path.extname(target)] || 'application/octet-stream'
      res.writeHead(200, { 'Content-Type': type })
      res.end(data)
    })
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Es Çay listening on 0.0.0.0:${port}`)
})

/**
 * High-speed local Node.js bridge for Hongguo Downloader V3.
 * Exposes pure JS signing, resolution, and CENC AES-CTR decryption.
 * Supports both HTTP microservice mode (port 9098) and direct CLI mode.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const fqapi = require('./fqapi.js');
const cenc = require('./cenc.js');

const PORT = parseInt(process.env.BRIDGE_PORT || '9098', 10);
const HOST = '127.0.0.1';

// CLI Mode
const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== 'serve') {
  const cmd = args[0];
  if (cmd === 'resolve') {
    const vid = args[1];
    if (!vid) {
      console.error(JSON.stringify({ error: 'Missing vid' }));
      process.exit(1);
    }
    fqapi.resolveVideo(vid)
      .then(info => {
        console.log(JSON.stringify({
          ok: true,
          vid: vid,
          mainUrl: info.mainUrl,
          key: info.key,
          definition: info.definition || '1080p',
          width: info.width || 1920,
          height: info.height || 1080,
          size: info.size || 0,
          headers: info.headers || {
            'User-Agent': 'com.phoenix.read/71332',
            'Referer': 'https://novel.snssdk.com/'
          },
          variants: info.variants || []
        }));
        process.exit(0);
      })
      .catch(err => {
        console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
        process.exit(1);
      });
  } else if (cmd === 'decrypt') {
    const inPath = args[1];
    const outPath = args[2];
    const key = args[3];
    if (!inPath || !outPath || !key) {
      console.error(JSON.stringify({ error: 'Missing inPath, outPath, or key' }));
      process.exit(1);
    }
    cenc.decryptFile(inPath, outPath, key)
      .then(() => {
        console.log(JSON.stringify({ ok: true, inPath, outPath }));
        process.exit(0);
      })
      .catch(err => {
        console.error(JSON.stringify({ ok: false, error: err.message || String(err) }));
        process.exit(1);
      });
  } else {
    console.error(JSON.stringify({ error: `Unknown CLI command: ${cmd}` }));
    process.exit(1);
  }
} else {
  // HTTP Microservice Mode
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    const pathname = parsedUrl.pathname;

    // Health check
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    }

    // GET /resolve?vid=...
    if (pathname === '/resolve' && req.method === 'GET') {
      const vid = parsedUrl.searchParams.get('vid');
      if (!vid) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Missing vid parameter' }));
      }

      try {
        const info = await fqapi.resolveVideo(vid);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          ok: true,
          vid: vid,
          mainUrl: info.mainUrl,
          key: info.key,
          definition: info.definition || '1080p',
          width: info.width || 1920,
          height: info.height || 1080,
          size: info.size || 0,
          headers: info.headers || {
            'User-Agent': 'com.phoenix.read/71332',
            'Referer': 'https://novel.snssdk.com/'
          },
          variants: info.variants || []
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
      }
    }

    // POST /decrypt { inPath, outPath, key }
    if (pathname === '/decrypt' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { inPath, outPath, key } = data;
          if (!inPath || !outPath || !key) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'Missing inPath, outPath or key' }));
          }

          await cenc.decryptFile(inPath, outPath, key);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: true, inPath, outPath }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Bridge] Hongguo local resolver bridge listening on http://${HOST}:${PORT}`);
  });

  process.on('SIGTERM', () => {
    server.close();
    process.exit(0);
  });
}

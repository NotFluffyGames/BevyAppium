// A fake "game" for lifecycle tests: serves the Agent's JSON-RPC port but ignores SIGTERM,
// so only a SIGKILL ends it. Tests freeze it with SIGSTOP to simulate a hung game.
import http from 'node:http';
process.on('SIGTERM', () => {});
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    const id = JSON.parse(body || '{}').id ?? null;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result: { results: [] } }));
  });
});
server.listen(Number(process.env.BEVYAPPIUM_PORT), '127.0.0.1');

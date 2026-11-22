// PROTOTYPE: throwaway. Driver side of ticket 04: launch game, run a script, reply-after-frame over BRP SSE.
import { spawn } from 'node:child_process';
const GAME = new URL('../agent/target/debug/proto_agent', import.meta.url).pathname;
const URL_ = 'http://127.0.0.1:15702';
const game = spawn('xvfb-run', ['-a', '-s', '-screen 0 800x600x24', GAME],
  { env: { ...process.env, VK_ICD_FILENAMES: '/usr/share/vulkan/icd.d/lvp_icd.json', WGPU_BACKEND: 'vulkan' }, stdio: ['ignore', 'inherit', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(id, steps) {
  const t0 = Date.now();
  const res = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'bevyappium.run', params: { id, steps } }) });
  const body = await res.json();  // watching handler called WITHOUT +watch => one plain JSON reply, sent when handler returns Some
  return { ms: Date.now() - t0, ...(body.result ?? body) };
}
try {
  for (let i = 0; i < 120; i++) { try { await fetch(URL_, { method: 'POST', body: '{}' }); break } catch { await sleep(500) } }
  await sleep(3000);
  const show = (l, r) => console.log(l, JSON.stringify(r));
  show('before', await run(1, [{ wait: 2 }, { text: 'Counter' }, { find: 'ClickBtn' }]));
  show('click  ', await run(2, [{ click: 'ClickBtn' }, { wait: 2 }, { text: 'Counter' }]));
  show('click2 ', await run(3, [{ click: 'ClickBtn' }, { wait: 2 }, { text: 'Counter' }]));
  show('shot   ', await run(4, [{ screenshot: '/tmp/proto.png' }]));
} finally { game.kill(); spawn('pkill', ['-f', 'proto_agent']); }

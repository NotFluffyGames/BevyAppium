// `bevyappium inspect`: an interactive prompt over a running game's elements.
import { writeFileSync } from 'node:fs';
import readline from 'node:readline';
import type { AgentClient, Step } from './agent-client.js';

const HELP = 'Commands: tree | find <name> | text <id> | attr <id> <name> | click <id> | shot <file.png> | quit';

/** Commands that map straight to one Agent step. */
const STEP_COMMANDS: Record<string, (args: string[]) => Step> = {
  find: ([name]) => ({ find: { using: 'name', value: name } }),
  text: ([id]) => ({ text: id }),
  attr: ([id, name]) => ({ attr: { element: id, name } }),
  click: ([id]) => ({ click: id }),
};

/** The page-source XML as an indented tree: name, id and component types per entity. */
export function formatTree(xml: string): string {
  const lines: string[] = [];
  let depth = 0;
  for (const m of xml.matchAll(/<(\/?)Entity([^>]*?)(\/?)>/g)) {
    const [, closing, attrs, selfClosing] = m;
    if (closing) { depth--; continue; }
    const attr = (key: string) => attrs.match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? '';
    lines.push(`${'  '.repeat(depth)}${attr('name') || '(unnamed)'}  id=${attr('id')}  [${attr('components')}]`);
    if (!selfClosing) depth++;
  }
  return lines.join('\n');
}

async function runCommand(client: AgentClient, cmd: string, args: string[]): Promise<string> {
  const stepFor = STEP_COMMANDS[cmd];
  if (stepFor) return JSON.stringify((await client.run([stepFor(args)]))[0]);
  if (cmd === 'tree') return formatTree((await client.run([{ source: true }]))[0].xml as string);
  if (cmd === 'shot') {
    const result = (await client.run([{ screenshot: true }]))[0];
    if (!result.png) return JSON.stringify(result);
    writeFileSync(args[0], Buffer.from(result.png, 'base64'));
    return `saved ${args[0]}`;
  }
  return `unknown command '${cmd}'`;
}

export async function inspect(client: AgentClient, input: NodeJS.ReadableStream, output: NodeJS.WritableStream) {
  const say = (s: string) => output.write(s + '\n');
  const rl = readline.createInterface({ input, terminal: false });
  say(`Connected. ${HELP}`);
  for await (const line of rl) {
    const [cmd, ...args] = line.trim().split(/\s+/);
    if (!cmd) continue;
    if (cmd === 'quit' || cmd === 'exit') break;
    try { say(await runCommand(client, cmd, args)); } catch (e) { say(`error: ${(e as Error).message}`); }
  }
  rl.close();
}

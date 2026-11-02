// How a test profile gets the plugin. `row` is nix-config's shape: a patch row whose `name`
// is this checkout's lib/index.js. `link` and `tarball` are the bundle install users run:
// `dsh plugin --profile <p> add link:<checkout>` or `add <packed .tgz>`, which records the
// package as a profile dependency and bundle so DSH composes this repo's cordis.patch.yml.
// MMD_INSTALL picks the mode for the web and TUI suites (default `row`).
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PLUGIN_ENTRY = join(ROOT, 'lib/index.js');
export const PACKAGE_NAME = 'dsh-mermaid';
export const ROW_ID = 'ui-mermaid';

export type Install = 'row' | 'link' | 'tarball';
const MODES: readonly Install[] = ['row', 'link', 'tarball'];

export function installMode(): Install {
  const mode = (process.env.MMD_INSTALL ?? 'row') as Install;
  if (!MODES.includes(mode)) throw new Error(`MMD_INSTALL must be one of ${MODES.join(', ')}, got ${JSON.stringify(mode)}`);
  return mode;
}

/** Patch rows to give makeProfile: the explicit row in `row` mode, none for a bundle install. */
export function pluginRows(mode: Install): { id: string; name: string; config: object }[] {
  return mode === 'row' ? [{ id: ROW_ID, name: PLUGIN_ENTRY, config: {} }] : [];
}

/** The `name` the composed row carries in each mode. */
export function rowName(mode: Install): string {
  return mode === 'row' ? PLUGIN_ENTRY : PACKAGE_NAME;
}

interface Run { status: number | null; stdout: string; stderr: string }

/** The parts of a rig profile (test/rig/rig.mjs `makeProfile`) an install needs. */
export interface RigProfile { bin: string; name: string; work: string; env: NodeJS.ProcessEnv }

function run(cmd: string, args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<Run> {
  const { promise, resolve, reject } = Promise.withResolvers<Run>();
  const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('error', reject);
  child.on('exit', (status) => resolve({ status, stdout, stderr }));
  return promise;
}

let packed: { dir: string; file: string } | undefined;

/** `pnpm pack` of this checkout (built lib/ included through package.json `files`), once per process. */
export async function packTarball(): Promise<string> {
  if (packed) return packed.file;
  const dir = mkdtempSync(join(tmpdir(), 'dsh-mermaid-pack-'));
  const r = await run('pnpm', ['pack', '--pack-destination', dir], { cwd: ROOT });
  if (r.status !== 0) throw new Error(`pnpm pack failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  const file = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!file) throw new Error(`pnpm pack wrote no .tgz into ${dir}:\n${r.stdout}`);
  packed = { dir, file: join(dir, file) };
  process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
  return packed.file;
}

/** Install the plugin into a rig profile the way a user would; a no-op in `row` mode. */
export async function installPlugin(profile: RigProfile, mode: Install): Promise<Run | undefined> {
  if (mode === 'row') return undefined;
  const spec = mode === 'link' ? `link:${ROOT}` : await packTarball();
  const r = await run(profile.bin, ['plugin', '--profile', profile.name, 'add', spec], { cwd: profile.work, env: profile.env });
  if (r.status !== 0) throw new Error(`dsh plugin add ${spec} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
  return r;
}

/** Every `id: ui-mermaid` row in a `--dump-config` YAML tree, with the `name` that follows it. */
export function mermaidRows(dump: string): { name: string | undefined }[] {
  const rows: { name: string | undefined }[] = [];
  const lines = dump.split('\n');
  lines.forEach((line, i) => {
    const m = /^(\s*)- id: ui-mermaid\s*$/.exec(line);
    if (!m) return;
    const indent = m[1].length + 2;
    let name: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const lead = l.length - l.trimStart().length;
      if (l.trim() === '' || lead < indent || (lead === indent - 2 && l.trimStart().startsWith('- '))) break;
      const n = /^\s*name:\s*'?([^']*?)'?\s*$/.exec(l);
      if (n && lead === indent) { name = n[1]; break; }
    }
    rows.push({ name });
  });
  return rows;
}

// C-01..C-06: the private DSH web seams the plugin reads, pinned against the exact dsh build in DSH_ROOT
// (set by the flake devShell and by `nix flake check`). A DSH bump that moves any of them fails here first.
// Since 0.2.1-rc.2 CodeBlock and the markdown renderer ship only inside the minified dsh-web-frontend
// bundle, so the seams are matched structurally against that bundle (minified identifiers are captured,
// never hardcoded).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.env.DSH_ROOT;
if (!ROOT) throw new Error('DSH_ROOT is not set: run inside `nix develop` (or nix flake check) so the pinned dsh is under test');
const pkg = (name: string): string => join(ROOT, 'node_modules/@deepseek-ai', name);
const read = (path: string): string => readFileSync(path, 'utf8');

function bundles(): string[] {
  const assets = join(pkg('dsh-web-frontend'), 'dist/assets');
  return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => read(join(assets, f)));
}

/** The bundle exporting the UI primitives (`CodeBlock:<minified>` in its export map). */
const primitives = bundles().find((b) => /[{,]CodeBlock:[\w$]+[,}]/.test(b)) ?? '';
/** The minified local name of the exported CodeBlock component. */
const codeBlockName = /[{,]CodeBlock:([\w$]+)[,}]/.exec(primitives)?.[1] ?? '';

/** The source text of one function in the minified bundle: from `function name(` to its balanced closing brace. */
function fn(name: string): string {
  const start = primitives.indexOf(`function ${name}(`);
  expect(start, `function ${name} not found`).toBeGreaterThanOrEqual(0);
  let i = primitives.indexOf('{', primitives.indexOf(')', primitives.indexOf('}', start)));
  for (let depth = 0; i < primitives.length; i++) {
    if (primitives[i] === '{') depth++;
    else if (primitives[i] === '}' && --depth === 0) break;
  }
  return primitives.slice(start, i + 1);
}

describe('pinned DSH seams', () => {
  it('C-01: runs the pinned dsh 0.2.1-rc.2', () => {
    expect(JSON.parse(read(join(ROOT, 'package.json'))).version).toBe('0.2.1-rc.2');
  });

  it('C-02: CodeBlock takes { code, lang, streaming } props and roots at div.md-code-block', () => {
    expect(codeBlockName, 'CodeBlock export not found in dsh-web-frontend').not.toBe('');
    const codeBlock = fn(codeBlockName);
    expect(codeBlock).toMatch(/^function [\w$]+\(\{code:[\w$]+,lang:[\w$]+,streaming:[\w$]+,/);
    expect(codeBlock).toContain('"md-code-block"');
    // The plugin reads the rendered source from [data-code-block-content] code.
    expect(codeBlock).toContain('"data-code-block-content":!0');
    expect(codeBlock).toMatch(/jsx\("pre",\{[\s\S]*?jsx\("code",\{/);
  });

  it('C-03: both CodeBlock headers carry [data-code-block-banner] with a <button> to clone the toggle from', () => {
    const codeBlock = fn(codeBlockName);
    expect(codeBlock).toMatch(/"data-code-block-banner":!0[\s\S]*?jsx\("button",\{/);
    const toolbar = new RegExp(`jsx\\(([\\w$]+),\\{lang:[\\w$]+,labels:`).exec(codeBlock)?.[1];
    expect(toolbar, 'CodeBlock toolbar header not found').toBeDefined();
    expect(fn(toolbar ?? '')).toMatch(/"data-code-block-banner":!0[\s\S]*?jsx\("button",\{/);
  });

  it('C-04: markdown fences reach CodeBlock with code = value + "\\n", lang = first word of the info string, and the message streaming flag', () => {
    const call = new RegExp(`jsx\\(${codeBlockName.replace('$', '\\$')},\\{code:\`\\$\\{[\\w$]+\\.value\\}\\n\`,lang:[\\w$]+,streaming:[\\w$]+\\.streaming,`).exec(primitives);
    expect(call, 'markdown fence → CodeBlock call not found').not.toBeNull();
    const start = primitives.lastIndexOf('function ', call?.index ?? 0);
    const renderCode = fn(/^function ([\w$]+)\(/.exec(primitives.slice(start))?.[1] ?? '');
    expect(renderCode).toMatch(/if\([\w$]+\.value===""\)return [\w$]+\.jsx\("pre"/);
    expect(renderCode).toMatch(/\/\^\[\\w-\]\+\/\.exec\([\w$]+\)\?\.\[0\]/);
  });

  it('C-05: the web frontend is React 18.3.1 and keys DOM fibers as __reactFiber$<random>', () => {
    const react = bundles().find((b) => b.includes('reconcilerVersion:"18.3.1'));
    expect(react, 'react-dom 18.3.1 reconciler not found in dsh-web-frontend').toBeDefined();
    expect(react).toMatch(/"__reactFiber\$"\+/);
    expect(react).toMatch(/"__reactProps\$"\+/);
  });

  it('C-06: the client half loads through the module loader (dsh.client.platform web) and lazy chunks via require.async', () => {
    const ours = JSON.parse(read(join(__dirname, '../../package.json')));
    expect(ours.dsh.client.platform).toBe('web');
    expect(ours.exports['./client']).toBe('./lib/client.js');
    const loader = bundles().find((b) => b.includes('__ModuleLoader__'));
    expect(loader, 'window.__ModuleLoader__ not found in dsh-web-frontend').toBeDefined();
    expect(loader).toMatch(/async/);
  });
});

// The installable bundle: `dsh plugin add` of this checkout (`link:`) and of its packed
// tarball composes exactly one ui-mermaid row from cordis.patch.yml, records the package as a
// profile bundle, survives a repeated add without duplicating the row, and the diagram really
// renders in dsh web. Independent of MMD_INSTALL; the other web suites run in any mode.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { type Install, installPlugin, mermaidRows, PACKAGE_NAME } from '../install';
import { closeBrowser, composer, screenshot, startWebFixture } from './fixture';

const FENCE = '```mermaid\nflowchart LR\n  A["bundle alpha"] --> B["bundle beta"]\n```';

interface Drawn { count: number; width: number; height: number; labels: string; visible: boolean; markers: number; toggle: string }

/** Runs in the page: the rendered mermaid diagrams, measured. */
function measure(): Drawn {
  const svgs = [...document.querySelectorAll<SVGSVGElement>('[data-dsh-mermaid] > svg')];
  const svg = svgs[0];
  if (svg === undefined) return { count: 0, width: 0, height: 0, labels: '', visible: false, markers: 0, toggle: '' };
  const box = svg.getBoundingClientRect();
  const style = getComputedStyle(svg);
  return {
    count: svgs.length,
    width: box.width,
    height: box.height,
    labels: svg.textContent ?? '',
    visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
    // The edge's arrowhead resolves to a marker inside this same SVG.
    markers: [...svg.querySelectorAll('[marker-end]')].filter((p) => {
      const ref = /url\(#([^)]+)\)/.exec(p.getAttribute('marker-end') ?? '')?.[1];
      return ref !== undefined && svg.querySelector(`marker[id="${CSS.escape(ref)}"]`) !== null;
    }).length,
    toggle: document.querySelector('[data-dsh-mermaid-toggle]')?.textContent ?? '',
  };
}

describe('dsh plugin add (real dsh web, bundle install)', () => {
  afterAll(closeBrowser);

  for (const install of ['link', 'tarball'] as Install[]) {
    it(`${install}: one composed row, a profile bundle, and a rendered diagram`, async () => {
      const f = await startWebFixture({ install });
      try {
        const manifest = JSON.parse(readFileSync(join(f.profile.dir, 'package.json'), 'utf8'));
        expect(manifest.dsh.profile.bundles.filter((b: string) => b === PACKAGE_NAME), 'profile bundles').toEqual([PACKAGE_NAME]);
        expect(Object.keys(manifest.dependencies), 'profile dependencies').toEqual([PACKAGE_NAME]);
        expect(mermaidRows((await f.profile.dumpConfig()).stdout), 'composed ui-mermaid rows').toEqual([{ name: PACKAGE_NAME }]);

        // Re-adding (a reinstall or upgrade) must not stack a second row or bundle entry.
        await installPlugin(f.profile, install);
        const again = JSON.parse(readFileSync(join(f.profile.dir, 'package.json'), 'utf8'));
        expect(again.dsh.profile.bundles.filter((b: string) => b === PACKAGE_NAME), 'bundles after re-add').toEqual([PACKAGE_NAME]);
        expect(mermaidRows((await f.profile.dumpConfig()).stdout), 'rows after re-add').toEqual([{ name: PACKAGE_NAME }]);

        f.replies.push({ text: `Diagram:\n\n${FENCE}\n\nDone.` });
        await composer(f.page).click();
        await f.page.keyboard.type('draw the bundle diagram');
        await f.page.keyboard.press('Enter');

        // Wait on the condition itself; on timeout the measurement below names what is missing.
        await f.page.waitForFunction(`(${measure.toString()})().markers > 0`, undefined, { timeout: 30_000 }).catch(() => undefined);
        const drawn = await f.page.evaluate(measure);
        await screenshot(f.page, `bundle-${install}`);
        expect(drawn.count, 'one diagram').toBe(1);
        expect(drawn.width, 'diagram width').toBeGreaterThan(100);
        expect(drawn.height, 'diagram height').toBeGreaterThan(20);
        expect(drawn.visible, 'diagram visible').toBe(true);
        expect(drawn.labels).toContain('bundle alpha');
        expect(drawn.labels).toContain('bundle beta');
        expect(drawn.markers, 'arrowhead resolves inside the svg').toBeGreaterThan(0);
        expect(drawn.toggle).toBe('Show code');
        expect(f.problems, 'P-09: page errors').toEqual([]);
      } catch (error) {
        await screenshot(f.page, `bundle-${install}-failure`);
        throw error;
      } finally {
        await f.dispose();
      }
    }, 120_000);
  }
});

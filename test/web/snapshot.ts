// What the page shows, read from the DOM only (the oracle compares it with test/web/model.ts).
import type { Page } from 'playwright';
import type { PageSnap } from './model';

export function snapshot(page: Page): Promise<PageSnap> {
  return page.evaluate(() => {
    // Computed colours can be rgb(), oklch(), color(srgb …); a 1×1 canvas normalizes any of them to sRGB bytes.
    const ink = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    const rgb = (css: string): [number, number, number, number] => {
      ink.clearRect(0, 0, 1, 1);
      ink.fillStyle = '#000';
      ink.fillStyle = css;
      ink.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ink.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a];
    };
    const luminance = ([r, g, b]: number[]): number => {
      const lin = (v: number): number => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    /** P-12: WCAG contrast of each flowchart node's label colour against its shape fill (min over nodes). */
    const legibility = (svg: SVGSVGElement | null): { nodes: number; minContrast: number | null } => {
      if (svg === null) return { nodes: 0, minContrast: null };
      let min: number | null = null;
      const nodes = [...svg.querySelectorAll('g.node')];
      for (const node of nodes) {
        const shape = node.querySelector('rect, polygon, circle, ellipse, path');
        const label = node.querySelector('.nodeLabel, foreignObject div, text');
        if (shape === null || label === null) continue;
        const fill = rgb(getComputedStyle(shape).fill);
        const color = rgb(getComputedStyle(label).color);
        if (fill[3] === 0) continue; // unfilled shape: the label sits on the card background
        const [hi, lo] = [luminance(fill), luminance(color)].sort((x, y) => y - x);
        const contrast = (hi + 0.05) / (lo + 0.05);
        min = min === null ? contrast : Math.min(min, contrast);
      }
      return { nodes: nodes.length, minContrast: min };
    };
    const blocks = [...document.querySelectorAll('.md-code-block')].map((root) => {
      const content = root.querySelector('[data-code-block-content]');
      const containers = root.querySelectorAll(':scope > [data-dsh-mermaid]');
      const c = containers[0] as HTMLElement | undefined;
      const executable: string[] = [];
      for (const el of c ? [c, ...c.querySelectorAll('*')] : []) {
        if (el.tagName.toLowerCase() === 'script') executable.push('script');
        for (const a of el.attributes) {
          if (/^on/i.test(a.name)) executable.push(a.name);
          if (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) executable.push('javascript:');
        }
      }
      return {
        code: content?.querySelector('code')?.textContent ?? '',
        contentDisplay: content ? getComputedStyle(content).display : 'missing',
        containers: containers.length,
        containerIsLast: c !== undefined && root.lastElementChild === c,
        containerDisplay: c ? getComputedStyle(c).display : null,
        error: c?.hasAttribute('data-dsh-mermaid-error') ?? false,
        text: c?.textContent ?? '',
        theme: c?.getAttribute('data-dsh-mermaid-theme') ?? null,
        svgs: c ? c.querySelectorAll(':scope > svg').length : 0,
        ...legibility(c?.querySelector<SVGSVGElement>(':scope > svg') ?? null),
        toggles: [...root.querySelectorAll('[data-dsh-mermaid-toggle]')].map((t) => t.getAttribute('aria-label') ?? ''),
        executable,
      };
    });
    const svgIds = [...document.querySelectorAll('[data-dsh-mermaid] > svg')].map((s) => s.id);
    const stray = document.querySelectorAll('body > [id^="dsh-mermaid-"], body > [id^="ddsh-mermaid-"], body > [id^="idsh-mermaid-"]').length;
    return { blocks, svgIds, stray, empties: 0 };
  });
}


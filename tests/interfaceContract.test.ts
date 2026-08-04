/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';

describe('public instrument contract', () => {
  it('keeps the approved eccentricity cap and raised Gravity default', () => {
    expect(html).toMatch(/id="eccentricity-control"[^>]*max="0\.92"/);
    expect(html).toMatch(/id="sound-gravity"[^>]*value="0\.74"/);
    expect(html).toContain('id="sound-gravity-value">74%</output>');
  });

  it('uses a signed time scrubber with an exact zero stop', () => {
    expect(html).toMatch(/id="speed-control"[^>]*min="-3"[^>]*max="3"[^>]*step="0\.1"/);
    expect(html).toContain('negative runs backward, zero stops, positive runs forward');
  });

  it('keeps fixed camera views in the Camera panel and the layout toggle in the masthead', () => {
    for (const view of ['spatial', 'centered', 'overhead', 'side']) {
      expect(html.match(new RegExp(`data-camera-view="${view}"`, 'g'))).toHaveLength(1);
    }
    expect(html).toMatch(/id="construction-layout-toggle"[^>]*data-construction-layout="merged"/);
    expect(html).not.toContain('view-switcher-popover');
    expect(html).not.toMatch(/data-camera-view="(?:proof|front|overview)"/);
    expect(html).not.toMatch(/>\s*(?:Proof|Front|Frame all)\s*</);
    expect(html).toMatch(/Travel with[\s\S]*?>Free<[\s\S]*?>Sun<[\s\S]*?>Planet<[\s\S]*?>Velocity</);
  });

  it('leaves the four command-centre tabs free of tooltips', () => {
    const dockTabs = html.match(/<button[^>]*class="dock-tab"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(dockTabs).toHaveLength(4);
    dockTabs.forEach(tab => expect(tab).not.toContain('data-interface-tooltip'));
  });

  it('keeps historical sources and the contemporary translation visibly distinct', () => {
    expect(html).toContain('/sources/Goodstein.pdf');
    expect(html).toContain('/sources/goodstein-p14-feynman-notes.jpg');
    expect(html).toContain('/sources/goodstein-p18-1964-lecture-photo.jpg');
    expect(html).toContain('/sources/goodstein-p21-feynman-1985.jpg');
    expect(html).toContain('class="translation-diagram"');
    expect(html).toContain('ONE EVENT · TWO REPRESENTATIONS · EDITORIAL BRIDGE');
    expect(html).toContain('another contemporary translation layer');
    expect(html).toContain('exact Drive-supplied eight-page Goodstein excerpt');
    expect(html).toContain('pending a separate publication-rights decision');
  });

  it('provides a compact controls sheet and links the creator name to Ifthis', () => {
    expect(html).toContain('id="stage-controls-overlay"');
    expect(html).toContain('Keyboard paths become active when the canvas has focus.');
    expect(html).toContain('https://twitter.com/intent/follow?screen_name=ifthis');
  });

  it('presents one camera-framing action through wheel, pinch, ruler, and bracket keys', () => {
    expect(html).toMatch(/Camera framing<\/span><span>Scroll or pinch<\/span><span><kbd>\[<\/kbd> <kbd>\]<\/kbd>/);
    expect(html).toContain('id="camera-framing-hud"');
    expect(html).toContain('aria-label="Camera framing from tight to wide"');
    expect(html).not.toMatch(/<kbd>[+−]<\/kbd>/);
    expect(html).not.toMatch(/\bFOV\b/i);
  });

  it('keeps narration volume independently adjustable in the Sound pane', () => {
    expect(html).toMatch(/id="panel-sound"[\s\S]*id="narration-volume"[^>]*value="1"/);
    expect(html).toContain('id="narration-volume-value">100%</output>');
  });

  it('intertwines the evidence with one chronological recovery story', () => {
    expect(html).toContain('aria-label="How the lecture was lost, recovered, and translated"');
    expect(html).not.toContain('class="source-field"');
    expect(html).not.toContain('class="source-gallery"');
    expect(html).toContain('1964 / CALTECH');
    expect(html).toContain('1964 / NOTES');
    expect(html).toContain('1965 / OMITTED');
    expect(html).toContain('1985 / CONTEXT');
    expect(html).toContain('1992–94 / RECOVERED');
    expect(html).toContain('NOW / TRANSLATED');
  });
});

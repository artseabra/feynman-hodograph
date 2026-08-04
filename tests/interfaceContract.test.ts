/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import gitIgnore from '../.gitignore?raw';
import vercelIgnore from '../.vercelignore?raw';
import html from '../index.html?raw';
import main from '../src/main.ts?raw';

describe('public instrument contract', () => {
  it('keeps the approved eccentricity cap and exact sound defaults', () => {
    expect(html).toMatch(/id="eccentricity-control"[^>]*max="0\.92"/);
    const defaults = [
      ['sound-master', '0.88', '88%'],
      ['sound-gravity', '0.77', '77%'],
      ['sound-velocity', '0.84', '84%'],
      ['sound-markers', '0.55', '55%'],
      ['narration-volume', '0.69', '69%'],
    ] as const;
    defaults.forEach(([id, value, label]) => {
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*value="${value}"`));
      expect(html).toContain(`id="${id}-value">${label}</output>`);
    });
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

  it('keeps both historical photographs and the contemporary translation visibly distinct', () => {
    expect(html).toContain('/sources/Goodstein.pdf');
    expect(html).toContain('/sources/goodstein-p14-feynman-notes-detail.jpg');
    expect(html).toContain('/sources/goodstein-p18-1964-lecture-photo-detail.jpg');
    expect(html).toContain('/sources/caltech-s46-feynman-microphone-1963.png');
    expect(html).toContain('Feynman wearing the lecture microphone.');
    expect(html).not.toContain('/sources/goodstein-p21-feynman-1985.jpg');
    expect(html).not.toContain('story-evidence-representation');
    expect(html).not.toContain('translation-diagram');
    expect(html).toContain('https://www.feynmanlectures.caltech.edu/recordings.html');
    expect(html).toContain('https://digital.archives.caltech.edu/collections/Images/1.10-5/');
    expect(html).toContain('https://www.maths.tcd.ie/pub/HistMath/People/Hamilton/Hodograph/');
    expect(html).toContain('April 29, 1963');
    expect(html).toContain('the planetary-motion tape survived');
    expect(html).toContain('122 lecture tapes');
    expect(html).toContain('3,043 frames');
    expect(html).toContain('image 1.10-5');
    expect(html).toContain('another contemporary translation layer');
    expect(html).toContain('exact Drive-supplied Goodstein and Goodstein excerpt');
    expect(html).toContain('outside the instrument’s MIT software license');
    expect(html.match(/data-local-source/g)).toHaveLength(3);
    expect(main).toContain("method: 'HEAD'");
    expect(main).toContain("contentType.includes('application/pdf')");
    expect(gitIgnore).not.toContain('public/sources/');
    expect(vercelIgnore).not.toContain('public/sources/');
  });

  it('provides a compact controls sheet and links the creator name to Ifthis', () => {
    expect(html).toContain('id="stage-controls-overlay"');
    expect(html).toContain('Keyboard paths become active when the canvas has focus.');
    expect(html).toContain('https://twitter.com/intent/follow?screen_name=ifthis');
    expect(html.match(/https:\/\/github\.com\/artseabra\/feynman-hodograph/g)).toHaveLength(2);
    expect(html).toContain('Open the Feynman hodograph source code on GitHub');
    expect(html).toContain('Open-source instrument on GitHub');
    expect(html).toContain('founder of Ifthis.');
    expect(html).not.toContain('founder of Ifthis Research');
  });

  it('presents one camera-framing action through wheel, pinch, ruler, and bracket keys', () => {
    expect(html).toMatch(/Camera framing<\/span><span>Scroll or pinch<\/span><span><kbd>\[<\/kbd> <kbd>\]<\/kbd>/);
    expect(html).toContain('id="camera-framing-hud"');
    expect(html).toContain('aria-label="Camera framing from tight to wide"');
    expect(html).not.toMatch(/<kbd>[+−]<\/kbd>/);
    expect(html).not.toMatch(/\bFOV\b/i);
  });

  it('keeps narration volume independently adjustable in the Sound pane', () => {
    expect(html).toMatch(/id="panel-sound"[\s\S]*id="narration-volume"[^>]*value="0\.69"/);
    expect(html).toContain('id="narration-volume-value">69%</output>');
    expect(html).toMatch(/label for="narration-volume"[^>]*data-tone="neutral"/);
    expect(html).toMatch(/id="narration-volume"[^>]*data-tone="neutral"/);
  });

  it('intertwines the evidence with one chronological recovery story', () => {
    expect(html).toContain('aria-label="How the lecture was lost, recovered, and translated"');
    expect(html).not.toContain('class="source-field"');
    expect(html).not.toContain('class="source-gallery"');
    expect(html).toContain('1846–47 / HAMILTON');
    expect(html).toContain('1961–64 / RECORDED COURSE');
    expect(html).toContain('1964 / S55');
    expect(html).toContain('1964 / NOTES');
    expect(html).toContain('1965 / OMITTED');
    expect(html).not.toContain('1985 / CONTEXT');
    expect(html).toContain('1992 / FOUND');
    expect(html).toContain('1993 / MATCHED');
    expect(html).toContain('1994 / RECONSTRUCTED');
    expect(html).toContain('NOW / TRANSLATED');
  });
});

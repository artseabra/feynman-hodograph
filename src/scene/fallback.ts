import type { OrbitalState, ThemePalette } from '../types';
import { equalTimeSamples, hodographCircle, orbitalState, TAU } from '../model/orbit';

export class FallbackRenderer {
  readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private devicePixelRatio = 1;
  private palette: ThemePalette;
  private eccentricity: number;
  private wedges: number;

  constructor(container: HTMLElement, eccentricity: number, wedges: number, palette: ThemePalette) {
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available.');
    this.context = context;
    this.palette = palette;
    this.eccentricity = eccentricity;
    this.wedges = wedges;
    this.canvas.className = 'fallback-canvas';
    this.canvas.setAttribute('aria-label', 'Two-dimensional fallback for the hodograph construction');
    container.replaceChildren(this.canvas);
  }

  setParameters(eccentricity: number, wedges: number): void {
    this.eccentricity = eccentricity;
    this.wedges = wedges;
  }

  setPalette(palette: ThemePalette): void {
    this.palette = palette;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.devicePixelRatio);
    this.canvas.height = Math.round(this.height * this.devicePixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  render(state: OrbitalState): void {
    const context = this.context;
    context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.fillStyle = this.palette.background;
    context.fillRect(0, 0, this.width, this.height);

    const compact = this.width < 680;
    const panelWidth = compact ? this.width - 44 : (this.width - 68) / 2;
    const panelHeight = compact ? (this.height - 88) / 2 : this.height - 46;
    const orbitPanel = { x: 22, y: 24, width: panelWidth, height: panelHeight };
    const hodoPanel = compact
      ? { x: 22, y: panelHeight + 62, width: panelWidth, height: panelHeight }
      : { x: panelWidth + 46, y: 24, width: panelWidth, height: panelHeight };

    this.drawOrbit(orbitPanel, state);
    this.drawHodograph(hodoPanel, state);
  }

  private drawOrbit(panel: { x: number; y: number; width: number; height: number }, state: OrbitalState): void {
    const context = this.context;
    const e = this.eccentricity;
    const scale = Math.min(panel.width / (3.7 + e), panel.height / 3.05);
    const focus = { x: panel.x + panel.width * 0.39, y: panel.y + panel.height * 0.54 };
    const center = { x: focus.x + e * scale, y: focus.y };
    const samples = equalTimeSamples(e, this.wedges);

    this.framePanel(panel, 'POSITION SPACE', 'ORBIT');
    samples.forEach((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      context.fillStyle = index % 2 === 0 ? this.alpha(this.palette.wedge, 0.2) : this.alpha(this.palette.wedge, 0.1);
      context.beginPath();
      context.moveTo(focus.x, focus.y);
      context.lineTo(focus.x + sample.position.x * scale, focus.y - sample.position.y * scale);
      context.lineTo(focus.x + next.position.x * scale, focus.y - next.position.y * scale);
      context.closePath();
      context.fill();
    });

    context.setLineDash([4, 4]);
    context.strokeStyle = this.alpha(this.palette.construction, 0.65);
    context.lineWidth = 1;
    context.beginPath();
    context.arc(center.x, center.y, scale, 0, TAU);
    context.stroke();
    context.setLineDash([]);

    context.strokeStyle = this.palette.orbit;
    context.lineWidth = 1.6;
    context.beginPath();
    for (let index = 0; index <= 200; index += 1) {
      const sample = orbitalState(e, index / 200 * TAU);
      const x = focus.x + sample.position.x * scale;
      const y = focus.y - sample.position.y * scale;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();

    const point = { x: focus.x + state.position.x * scale, y: focus.y - state.position.y * scale };
    context.strokeStyle = this.palette.orbit;
    context.beginPath();
    context.moveTo(focus.x, focus.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    this.dot(focus.x, focus.y, 6, this.palette.sun);
    this.dot(point.x, point.y, 5.4, this.palette.orbit);
  }

  private drawHodograph(panel: { x: number; y: number; width: number; height: number }, state: OrbitalState): void {
    const context = this.context;
    const circle = hodographCircle(this.eccentricity);
    const extent = circle.radius + Math.abs(circle.center.y) + 0.35;
    const scale = Math.min(panel.width, panel.height) * 0.38 / extent;
    const origin = { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
    const center = { x: origin.x + circle.center.x * scale, y: origin.y - circle.center.y * scale };
    const samples = equalTimeSamples(this.eccentricity, this.wedges);

    this.framePanel(panel, 'VELOCITY SPACE', 'HODOGRAPH');
    context.strokeStyle = this.alpha(this.palette.grid, 0.72);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(panel.x + 18, origin.y);
    context.lineTo(panel.x + panel.width - 18, origin.y);
    context.moveTo(origin.x, panel.y + 18);
    context.lineTo(origin.x, panel.y + panel.height - 18);
    context.stroke();

    context.setLineDash([4, 4]);
    context.strokeStyle = this.palette.construction;
    context.beginPath();
    context.arc(center.x, center.y, circle.radius * scale, 0, TAU);
    context.stroke();
    context.setLineDash([]);

    context.strokeStyle = this.alpha(this.palette.hodograph, 0.8);
    context.lineWidth = 1.5;
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = origin.x + sample.velocity.x * scale;
      const y = origin.y - sample.velocity.y * scale;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    const start = samples[0];
    context.lineTo(origin.x + start.velocity.x * scale, origin.y - start.velocity.y * scale);
    context.stroke();

    const point = { x: origin.x + state.velocity.x * scale, y: origin.y - state.velocity.y * scale };
    context.strokeStyle = this.palette.vector;
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    this.dot(origin.x, origin.y, 3.5, this.palette.ink);
    this.dot(center.x, center.y, 3.5, this.palette.hodograph);
    this.dot(point.x, point.y, 5.4, this.palette.hodograph);
  }

  private framePanel(panel: { x: number; y: number; width: number; height: number }, left: string, right: string): void {
    const context = this.context;
    context.strokeStyle = this.alpha(this.palette.rule, 0.95);
    context.lineWidth = 1;
    context.strokeRect(panel.x, panel.y, panel.width, panel.height);
    context.fillStyle = this.palette.muted;
    context.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(left, panel.x + 12, panel.y + 19);
    context.textAlign = 'right';
    context.fillText(right, panel.x + panel.width - 12, panel.y + 19);
    context.textAlign = 'left';
  }

  private dot(x: number, y: number, radius: number, fill: string): void {
    this.context.fillStyle = fill;
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, TAU);
    this.context.fill();
  }

  private alpha(hex: string, alpha: number): string {
    const value = hex.replace('#', '');
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
}

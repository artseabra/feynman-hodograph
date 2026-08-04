import { describe, expect, it } from 'vitest';
import {
  TOOLTIP_NEAR_DEPTH_TOLERANCE,
  selectTooltipCandidate,
  type TooltipHitCandidate,
} from '../src/scene/canvasTooltips';

function candidate(
  target: string,
  distance: number,
  priority: number,
): TooltipHitCandidate<string> {
  return { target, distance, priority };
}

describe('canvas tooltip hit arbitration', () => {
  it('keeps the genuinely foreground surface ahead of a higher-priority object behind it', () => {
    const selected = selectTooltipCandidate([
      candidate('foreground orbit', 2, 2),
      candidate('background marker', 2 + TOOLTIP_NEAR_DEPTH_TOLERANCE + 0.01, 99),
    ]);

    expect(selected?.target).toBe('foreground orbit');
  });

  it('uses semantic priority for near-coincident intersections', () => {
    const selected = selectTooltipCandidate([
      candidate('broad plane', 2, 1),
      candidate('specific marker', 2 + TOOLTIP_NEAR_DEPTH_TOLERANCE / 2, 8),
    ]);

    expect(selected?.target).toBe('specific marker');
  });

  it('uses the nearer intersection when near-coincident priorities tie', () => {
    const selected = selectTooltipCandidate([
      candidate('farther line', 2.02, 5),
      candidate('nearer line', 2, 5),
    ]);

    expect(selected?.target).toBe('nearer line');
  });
});

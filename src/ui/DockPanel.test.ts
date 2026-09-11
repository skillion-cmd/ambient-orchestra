import { describe, it, expect } from 'vitest';
import { panelForMode, panelsForMode } from './DockPanel';

describe('panelsForMode', () => {
  it('offers no tabs in Drift — the hands-off mode hides its controls', () => {
    expect(panelsForMode('drift')).toEqual([]);
  });

  it('offers the two rails in Calibrate', () => {
    expect(panelsForMode('calibrate')).toEqual(['audio', 'visual']);
  });

  it('leads with the instrument in Play', () => {
    expect(panelsForMode('play')).toEqual(['play', 'audio', 'visual']);
  });
});

describe('panelForMode', () => {
  it('lands on the instrument when Play is entered, whatever was open', () => {
    expect(panelForMode('play', 'visual')).toBe('play');
    expect(panelForMode('play', null)).toBe('play');
  });

  it('keeps the open rail when the mode change does not remove it', () => {
    expect(panelForMode('calibrate', 'visual')).toBe('visual');
  });

  it('falls back to audio when leaving Play, where the instrument tab goes', () => {
    expect(panelForMode('calibrate', 'play')).toBe('audio');
    expect(panelForMode('calibrate', null)).toBe('audio');
  });

  it('shows nothing in Drift', () => {
    expect(panelForMode('drift', 'audio')).toBeNull();
  });
});

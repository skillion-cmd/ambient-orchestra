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

  it('leads with the grid in Kit and the set in Stage', () => {
    expect(panelsForMode('kit')).toEqual(['kit', 'audio', 'visual']);
    expect(panelsForMode('stage')).toEqual(['stage', 'audio', 'visual']);
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

  it('lands on the panel a mode brought with it', () => {
    expect(panelForMode('kit', 'audio')).toBe('kit');
    expect(panelForMode('stage', 'play')).toBe('stage');
  });

  it('drops another mode panel when leaving the mode that owned it', () => {
    expect(panelForMode('calibrate', 'kit')).toBe('audio');
    expect(panelForMode('calibrate', 'stage')).toBe('audio');
  });

  it('shows nothing in Drift', () => {
    expect(panelForMode('drift', 'audio')).toBeNull();
  });
});

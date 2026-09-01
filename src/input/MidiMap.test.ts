import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyLearnedMap,
  GENERIC_PROFILE,
  isPadNote,
  knobIndexForCC,
  KNOB_ORDER,
  learnCC,
  learnPad,
  loadLearnedMap,
  padSlotForNote,
  parseLearnedMap,
  profileForDevice,
  storeLearnedMap,
} from './MidiMap';

// Node has no localStorage — provide a minimal in-memory stand-in.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

const globals = globalThis as { localStorage?: unknown };
let saved: unknown;

beforeEach(() => {
  saved = globals.localStorage;
  globals.localStorage = new MemoryStorage();
});

afterEach(() => {
  globals.localStorage = saved;
});

const mpk = profileForDevice('MPK mini 3');
const launchkey = profileForDevice('Launchkey Mini MK3 MIDI');

describe('device profiles', () => {
  it('matches both controllers regardless of the port name decoration', () => {
    expect(profileForDevice('MPK mini 3').id).toBe('mpk-mini');
    expect(profileForDevice('Akai MPK Mini Mk II').id).toBe('mpk-mini');
    expect(profileForDevice('Launchkey Mini MK3 MIDI Port').id).toBe('launchkey-mini');
    expect(profileForDevice('LAUNCHKEY MINI LKMK3 DAW Out').id).toBe('launchkey-mini');
  });

  it('falls back to generic for an unknown or missing device', () => {
    expect(profileForDevice('Some Other Keyboard').id).toBe(GENERIC_PROFILE.id);
    expect(profileForDevice(null).id).toBe(GENERIC_PROFILE.id);
    expect(profileForDevice('').id).toBe(GENERIC_PROFILE.id);
  });

  it('gives every profile enough knob CCs for the hardware', () => {
    expect(mpk.knobCCs).toHaveLength(8);
    expect(launchkey.knobCCs).toHaveLength(8);
    expect(KNOB_ORDER).toHaveLength(9);
  });
});

describe('pad classification', () => {
  it('treats the launchkey drum channel as pads whatever the note', () => {
    expect(isPadNote(launchkey, 60, 10)).toBe(true);
    expect(isPadNote(launchkey, 60, 1)).toBe(false);
  });

  it('treats listed notes as pads on the MPK, which has no pad channel', () => {
    expect(isPadNote(mpk, 36, 1)).toBe(true);
    expect(isPadNote(mpk, 60, 1)).toBe(false);
  });

  it('slots an unlisted pad-channel note from the drum range', () => {
    expect(padSlotForNote(launchkey, emptyLearnedMap(), 40, 10)).toBe(4);
  });

  it('reports -1 for a key, so the keybed is never eaten by a pad', () => {
    expect(padSlotForNote(mpk, emptyLearnedMap(), 64, 1)).toBe(-1);
  });
});

describe('learn', () => {
  it('binds a CC and wins over the profile', () => {
    const map = learnCC(emptyLearnedMap(), 5, 2);
    expect(knobIndexForCC(mpk, map, 5)).toBe(2);
  });

  it('retires the factory CC once another pot is taught that knob', () => {
    const fresh = emptyLearnedMap();
    expect(knobIndexForCC(mpk, fresh, mpk.knobCCs[2]!)).toBe(2);
    const map = learnCC(fresh, 5, 2);
    expect(knobIndexForCC(mpk, map, mpk.knobCCs[2]!)).toBe(-1);
  });

  it('drops an earlier binding of the same slot', () => {
    let map = learnCC(emptyLearnedMap(), 5, 2);
    map = learnCC(map, 6, 2);
    expect(knobIndexForCC(mpk, map, 5)).toBe(-1);
    expect(knobIndexForCC(mpk, map, 6)).toBe(2);
  });

  it('rebinding one pot to a different knob leaves no stale slot', () => {
    let map = learnCC(emptyLearnedMap(), 5, 2);
    map = learnCC(map, 5, 7);
    expect(knobIndexForCC(mpk, map, 5)).toBe(7);
  });

  it('binds pads the same way', () => {
    let map = learnPad(emptyLearnedMap(), 60, 3);
    expect(padSlotForNote(mpk, map, 60, 1)).toBe(3);
    map = learnPad(map, 61, 3);
    expect(padSlotForNote(mpk, map, 60, 1)).toBe(-1);
  });
});

describe('persistence', () => {
  it('round-trips through storage', () => {
    const map = learnPad(learnCC(emptyLearnedMap(), 9, 1), 44, 6);
    storeLearnedMap(map);
    expect(loadLearnedMap()).toEqual(map);
  });

  it('returns an empty map when nothing is stored', () => {
    expect(loadLearnedMap()).toEqual(emptyLearnedMap());
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('ao-midi-map', '{not json');
    expect(loadLearnedMap()).toEqual(emptyLearnedMap());
  });

  it('drops junk entries key by key rather than the whole taught map', () => {
    const parsed = parseLearnedMap({
      ccToKnob: { 9: 1, 200: 2, 10: 99, x: 3, 11: 'four' },
      noteToPad: { 44: 6, 45: -1 },
    });
    expect(parsed.ccToKnob).toEqual({ 9: 1 });
    expect(parsed.noteToPad).toEqual({ 44: 6 });
  });

  it('ignores a stored value that is not an object', () => {
    expect(parseLearnedMap('nope')).toEqual(emptyLearnedMap());
    expect(parseLearnedMap(null)).toEqual(emptyLearnedMap());
  });
});

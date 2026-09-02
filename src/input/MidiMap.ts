import type { SoundKnobs } from '../audio/types';

/** What a hardware control is bound to. */
export type MidiTarget =
  | { kind: 'knob'; key: keyof SoundKnobs }
  | { kind: 'preset'; index: number }
  | { kind: 'gesture'; id: GestureId };

export type GestureId =
  | 'nextPhase'
  | 'nextMovement'
  | 'spaceThrow'
  | 'inhale'
  | 'vacuum'
  | 'thinMix'
  | 'nextForm'
  | 'panic';

/** The nine sound knobs, in the order the rail lays them out. */
export const KNOB_ORDER: (keyof SoundKnobs)[] = [
  'pulse',
  'activity',
  'memory',
  'entropy',
  'warmth',
  'space',
  'foundation',
  'width',
  'texture',
];

/** Pad bank B, in pad order. */
export const GESTURE_ORDER: GestureId[] = [
  'nextPhase',
  'nextMovement',
  'spaceThrow',
  'inhale',
  'vacuum',
  'thinMix',
  'nextForm',
  'panic',
];

export const GESTURE_LABELS: Record<GestureId, string> = {
  nextPhase: 'Phase',
  nextMovement: 'Movement',
  spaceThrow: 'Space',
  inhale: 'Inhale',
  vacuum: 'Vacuum',
  thinMix: 'Thin',
  nextForm: 'Form',
  panic: 'All notes off',
};

export interface DeviceProfile {
  id: string;
  label: string;
  /** Lowercased substrings matched against the MIDI port name. */
  match: string[];
  /** CC numbers for the eight hardware knobs, in KNOB_ORDER. */
  knobCCs: number[];
  /** Notes the pads send. Bank A selects presets, bank B fires gestures. */
  padNotes: number[];
  /** Pads on this channel (1-based) are pads whatever note they send. */
  padChannel: number | null;
}

/**
 * Factory mappings for the two controllers this was built against, plus a
 * generic fallback.
 *
 * These are a convenience, not a contract. Both units are user-programmable
 * and their factory CC assignments differ between hardware revisions and
 * between the presets stored on the device, so anything here can be wrong on
 * a given desk. That is what learn mode is for — a binding you teach it wins
 * over the profile and outlives the session.
 */
export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'mpk-mini',
    label: 'Akai MPK Mini',
    match: ['mpk mini', 'mpkmini', 'mpk'],
    knobCCs: [70, 71, 72, 73, 74, 75, 76, 77],
    // Bank A pads, then bank B.
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    padChannel: null,
  },
  {
    id: 'launchkey-mini',
    label: 'Novation Launchkey Mini',
    match: ['launchkey mini', 'launchkey'],
    knobCCs: [21, 22, 23, 24, 25, 26, 27, 28],
    padNotes: [96, 97, 98, 99, 100, 101, 102, 103, 112, 113, 114, 115, 116, 117, 118, 119],
    padChannel: 10,
  },
  {
    id: 'generic',
    label: 'MIDI controller',
    match: [],
    knobCCs: [21, 22, 23, 24, 25, 26, 27, 28],
    padNotes: [36, 37, 38, 39, 40, 41, 42, 43],
    padChannel: 10,
  },
];

export const GENERIC_PROFILE = DEVICE_PROFILES[DEVICE_PROFILES.length - 1]!;

/** Pick the profile whose name best matches a connected port. */
export function profileForDevice(name: string | null | undefined): DeviceProfile {
  const needle = (name ?? '').toLowerCase();
  if (!needle) return GENERIC_PROFILE;
  for (const profile of DEVICE_PROFILES) {
    if (profile.match.some((m) => needle.includes(m))) return profile;
  }
  return GENERIC_PROFILE;
}

/** A note is a pad if its channel says so, or if the profile lists the note. */
export function isPadNote(
  profile: DeviceProfile,
  note: number,
  channel: number,
): boolean {
  if (profile.padChannel !== null && channel === profile.padChannel) return true;
  return profile.padNotes.includes(note);
}

/** Which pad a note is, or -1. Channel-matched pads fall back to note order. */
export function padIndex(
  profile: DeviceProfile,
  note: number,
  channel: number,
): number {
  const listed = profile.padNotes.indexOf(note);
  if (listed >= 0) return listed;
  if (profile.padChannel !== null && channel === profile.padChannel) {
    // An unlisted pad on the pad channel still deserves a slot — count from
    // the bottom of the General MIDI drum range rather than dropping it.
    return note - 36;
  }
  return -1;
}

/** Learned overrides: CC number → knob index, pad note → pad index. */
export interface LearnedMap {
  ccToKnob: Record<number, number>;
  noteToPad: Record<number, number>;
}

export function emptyLearnedMap(): LearnedMap {
  return { ccToKnob: {}, noteToPad: {} };
}

/**
 * Bind a control, dropping any earlier binding of the same slot.
 *
 * One physical control per slot in both directions — without the reverse
 * sweep, re-learning knob 3 onto a pot already bound to knob 5 would leave
 * that pot driving both.
 */
export function learnCC(map: LearnedMap, cc: number, knobIndex: number): LearnedMap {
  const ccToKnob = { ...map.ccToKnob, [cc]: knobIndex };
  for (const key of Object.keys(ccToKnob)) {
    const num = Number(key);
    if (num !== cc && ccToKnob[num] === knobIndex) delete ccToKnob[num];
  }
  return { ...map, ccToKnob };
}

export function learnPad(map: LearnedMap, note: number, padSlot: number): LearnedMap {
  const noteToPad = { ...map.noteToPad, [note]: padSlot };
  for (const key of Object.keys(noteToPad)) {
    const num = Number(key);
    if (num !== note && noteToPad[num] === padSlot) delete noteToPad[num];
  }
  return { ...map, noteToPad };
}

/** Knob index for a CC, or -1 — a learned binding wins over the profile. */
export function knobIndexForCC(
  profile: DeviceProfile,
  map: LearnedMap,
  cc: number,
): number {
  const learned = map.ccToKnob[cc];
  if (learned !== undefined) return learned;
  const fromProfile = profile.knobCCs.indexOf(cc);
  if (fromProfile < 0) return -1;
  // Once another pot has been taught this knob, the factory assignment is
  // stale. Two pots fighting over one knob is worse than one pot going quiet,
  // and the quiet one is a re-learn away from working.
  return Object.values(map.ccToKnob).includes(fromProfile) ? -1 : fromProfile;
}

/** Pad slot for a note, or -1 — a learned binding wins over the profile. */
export function padSlotForNote(
  profile: DeviceProfile,
  map: LearnedMap,
  note: number,
  channel: number,
): number {
  const learned = map.noteToPad[note];
  if (learned !== undefined) return learned;
  const fromProfile = padIndex(profile, note, channel);
  if (fromProfile < 0) return -1;
  return Object.values(map.noteToPad).includes(fromProfile) ? -1 : fromProfile;
}

const STORAGE_KEY = 'ao-midi-map';

export function loadLearnedMap(): LearnedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLearnedMap();
    return parseLearnedMap(JSON.parse(raw));
  } catch {
    return emptyLearnedMap();
  }
}

export function storeLearnedMap(map: LearnedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private browsing */
  }
}

/** Keys must be MIDI-range integers and values in-range slots; junk is dropped
 * key by key rather than resetting a whole map someone spent time teaching. */
export function parseLearnedMap(parsed: unknown): LearnedMap {
  const out = emptyLearnedMap();
  if (typeof parsed !== 'object' || parsed === null) return out;
  const raw = parsed as Record<string, unknown>;
  out.ccToKnob = readSlots(raw.ccToKnob, KNOB_ORDER.length);
  out.noteToPad = readSlots(raw.noteToPad, 16);
  return out;
}

function readSlots(raw: unknown, slots: number): Record<number, number> {
  const out: Record<number, number> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const num = Number(key);
    if (!Number.isInteger(num) || num < 0 || num > 127) continue;
    if (typeof value !== 'number' || !Number.isInteger(value)) continue;
    if (value < 0 || value >= slots) continue;
    out[num] = value;
  }
  return out;
}

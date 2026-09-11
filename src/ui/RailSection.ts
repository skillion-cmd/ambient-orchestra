/**
 * A labelled band inside a rail.
 *
 * The rails carry two completely different kinds of thing — numbers the
 * engine is reporting, and controls that change it — and until they were
 * labelled the only way to tell which was which was to click and find out.
 * A canvas of live bars looks exactly as touchable as a row of buttons at
 * 9px, and the phase name really was a button that looked like a word.
 *
 * So each rail is now two named bands: a readout, marked live and styled with
 * no box anywhere in it, and a controls band where everything has a box. The
 * rule the whole interface follows is one line long: **if it has a box, you
 * can touch it.**
 */
export type RailSectionKind = 'readout' | 'controls';

const HINTS: Record<RailSectionKind, string> = {
  readout: 'live',
  controls: 'tap · drag',
};

export interface RailSection {
  /** The band, header included — mount this. */
  element: HTMLElement;
  /** Where the contents go. */
  body: HTMLElement;
}

export function railSection(kind: RailSectionKind, title: string): RailSection {
  const element = document.createElement('section');
  element.className = `rail-section rail-section--${kind}`;

  const head = document.createElement('div');
  head.className = 'rail-section-head';

  const titleEl = document.createElement('span');
  titleEl.className = 'rail-section-title';
  titleEl.textContent = title;

  const hint = document.createElement('span');
  hint.className = 'rail-section-hint';
  if (kind === 'readout') {
    // A dot that breathes says "this is arriving on its own" faster than any
    // wording can, and it is the one animated thing in the rail.
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    dot.setAttribute('aria-hidden', 'true');
    hint.append(dot, document.createTextNode(HINTS[kind]));
  } else {
    hint.textContent = HINTS[kind];
  }

  head.append(titleEl, hint);

  const body = document.createElement('div');
  body.className = 'rail-section-body';

  element.append(head, body);
  return { element, body };
}

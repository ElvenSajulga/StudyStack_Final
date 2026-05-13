import { Injectable } from '@angular/core';

/** Canonical days of the week. */
export type DayCode = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_CODES: readonly DayCode[] = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
];

const DAY_LABELS: Record<DayCode, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu',
  fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

/**
 * A single recurring class meeting.
 * `startTime` and `endTime` are 24-hour `HH:mm` strings, e.g. "08:00", "13:30".
 */
export interface Meeting {
  day: DayCode;
  startTime: string;
  endTime: string;
}

export interface MeetingConflict {
  a: Meeting;
  b: Meeting;
}

/**
 * Stateless utility for detecting schedule overlaps and migrating legacy
 * free-text schedule strings into structured `Meeting[]`.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleConflictService {
  /**
   * Returns the first overlapping (a, b) pair if any meeting in `a`
   * overlaps any meeting in `b`, or null otherwise.
   *
   * Two meetings overlap iff they fall on the same day and their time
   * intervals intersect with positive duration. Touching intervals
   * (e.g. 09:00-10:00 and 10:00-11:00) are NOT considered overlapping.
   */
  findOverlap(a: Meeting[] | undefined, b: Meeting[] | undefined): MeetingConflict | null {
    if (!a?.length || !b?.length) return null;
    for (const ma of a) {
      const aStart = this.toMinutes(ma.startTime);
      const aEnd   = this.toMinutes(ma.endTime);
      if (aStart === null || aEnd === null || aEnd <= aStart) continue;
      for (const mb of b) {
        if (mb.day !== ma.day) continue;
        const bStart = this.toMinutes(mb.startTime);
        const bEnd   = this.toMinutes(mb.endTime);
        if (bStart === null || bEnd === null || bEnd <= bStart) continue;
        if (aStart < bEnd && bStart < aEnd) {
          return { a: ma, b: mb };
        }
      }
    }
    return null;
  }

  hasOverlap(a: Meeting[] | undefined, b: Meeting[] | undefined): boolean {
    return this.findOverlap(a, b) !== null;
  }

  /** Returns the first overlap between `candidate` and any item of `others`, or null. */
  findFirstConflict<T>(
    candidate: Meeting[] | undefined,
    others: T[],
    selector: (t: T) => Meeting[] | undefined,
  ): { other: T; conflict: MeetingConflict } | null {
    if (!candidate?.length) return null;
    for (const other of others) {
      const overlap = this.findOverlap(candidate, selector(other));
      if (overlap) return { other, conflict: overlap };
    }
    return null;
  }

  /** Cosmetic — "Mon 09:00–10:30". */
  formatMeeting(m: Meeting): string {
    return `${DAY_LABELS[m.day]} ${m.startTime}–${m.endTime}`;
  }

  /** Cosmetic — joins multiple meetings with " · ". Empty if none. */
  formatMeetings(meetings: Meeting[] | undefined): string {
    if (!meetings?.length) return '';
    return meetings.map(m => this.formatMeeting(m)).join(' · ');
  }

  /**
   * Best-effort parser for the legacy free-text `Course.schedule` field.
   * Returns an empty array when the input doesn't match a recognized shape;
   * callers should treat that as "schedule unknown, no conflict check possible".
   *
   * Recognized patterns (case-insensitive, whitespace-flexible):
   *   - Day token cluster: M / T / W / Th / F / Sat / Sun (concat or comma-sep)
   *   - Time range: HH(:MM)?(am|pm)? - HH(:MM)?(am|pm)?
   *
   * Examples it handles:
   *   "MWF 8:00–9:00 AM"
   *   "TTh 1-2:30 PM"
   *   "Sat 9:00am - 12:00pm"
   *   "Mon, Wed 10:30-11:45"
   */
  parseScheduleString(input: string | undefined | null): Meeting[] {
    if (!input) return [];
    const cleaned = input
      .replace(/–|—|−/g, '-')   // normalize dashes
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return [];

    // Pull a time range out: capture optional am/pm on either side.
    const timeRangeRe =
      /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
    const timeMatch = cleaned.match(timeRangeRe);
    if (!timeMatch) return [];

    const [
      , sH, sM, sMer,
        eH, eM, eMer,
    ] = timeMatch;
    const endMer = eMer ?? sMer;
    const startMer = sMer ?? eMer;
    const startMin = this.parseClock(sH, sM, startMer);
    const endMin   = this.parseClock(eH, eM, endMer);
    if (startMin === null || endMin === null || endMin <= startMin) return [];

    // The day cluster is the portion before the time range.
    const dayChunk = cleaned.slice(0, timeMatch.index ?? 0).trim();
    const days = this.parseDayCluster(dayChunk);
    if (days.length === 0) return [];

    const startTime = this.minutesToClock(startMin);
    const endTime   = this.minutesToClock(endMin);
    return days.map(day => ({ day, startTime, endTime }));
  }

  // ─── internals ────────────────────────────────────────────────────────────

  /** "08:30" → 510. Returns null if malformed. */
  private toMinutes(hhmm: string | undefined): number | null {
    if (!hhmm) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  }

  private minutesToClock(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private parseClock(h: string, m: string | undefined, mer: string | undefined): number | null {
    let hour = Number(h);
    const minute = Number(m ?? '0');
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (minute < 0 || minute > 59) return null;
    const merNorm = mer?.toLowerCase();
    if (merNorm === 'am') {
      if (hour === 12) hour = 0;
    } else if (merNorm === 'pm') {
      if (hour < 12) hour += 12;
    } else if (!merNorm) {
      // No meridiem — assume the value is already 24h-ish, but coerce
      // common single-digit "1-2:30" style into PM where it falls in the
      // typical class-day range (1–7 → PM). A teacher writing "1-2:30"
      // overwhelmingly means afternoon.
      if (hour >= 1 && hour <= 7) hour += 12;
    }
    if (hour < 0 || hour > 23) return null;
    return hour * 60 + minute;
  }

  /**
   * "MWF" → [mon, wed, fri], "TTh" → [tue, thu], "Sat, Sun" → [sat, sun].
   * Order is preserved as it appears in the input.
   */
  private parseDayCluster(chunk: string): DayCode[] {
    const cleaned = chunk.replace(/[,/&]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    const days: DayCode[] = [];
    const seen = new Set<DayCode>();
    const push = (d: DayCode) => { if (!seen.has(d)) { seen.add(d); days.push(d); } };

    // First, try multi-letter long tokens (case-insensitive).
    const longTokens = cleaned.split(' ');
    let consumedLongTokens = true;
    for (const tok of longTokens) {
      const norm = tok.toLowerCase();
      if (norm === 'mon')        push('mon');
      else if (norm === 'tue' || norm === 'tues') push('tue');
      else if (norm === 'wed')   push('wed');
      else if (norm === 'thu' || norm === 'thur' || norm === 'thurs') push('thu');
      else if (norm === 'fri')   push('fri');
      else if (norm === 'sat')   push('sat');
      else if (norm === 'sun')   push('sun');
      else { consumedLongTokens = false; break; }
    }
    if (consumedLongTokens && days.length > 0) return days;

    // Fallback: scan a concatenated short-code stream like "MWF" or "TTh".
    days.length = 0;
    seen.clear();
    const compact = cleaned.replace(/\s+/g, '');
    let i = 0;
    while (i < compact.length) {
      const c2 = compact.slice(i, i + 2).toLowerCase();
      const c3 = compact.slice(i, i + 3).toLowerCase();
      if (c3 === 'sat') { push('sat'); i += 3; continue; }
      if (c3 === 'sun') { push('sun'); i += 3; continue; }
      if (c2 === 'th')  { push('thu'); i += 2; continue; }
      const c1 = compact[i].toLowerCase();
      if (c1 === 'm') { push('mon'); i += 1; continue; }
      if (c1 === 't') { push('tue'); i += 1; continue; }
      if (c1 === 'w') { push('wed'); i += 1; continue; }
      if (c1 === 'f') { push('fri'); i += 1; continue; }
      if (c1 === 's') { push('sat'); i += 1; continue; }
      // Unknown character — bail out
      return [];
    }
    return days;
  }
}

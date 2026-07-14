// Pure adherence/compliance math — no browser or Firebase dependencies, so it
// can be unit-tested directly in Node (see tests/compliance/). Imported by app.js.
//
// C-1 (clinical correctness): plans assigned mid-week must not count expected
// sessions from Monday. Doing so produced fake "missed" days and red ~0%
// adherence for patients who were, in fact, perfectly on track since assignment.

export function getIntervalDays(frequency) {
  const intervals = { daily: 1, twice_daily: 0.5, every_other: 2, three_week: 7 / 3 };
  if (frequency && frequency.startsWith('custom_')) return parseInt(frequency.split('_')[1]) || 1;
  return intervals[frequency] || 1;
}

export function getExpectedSessions(frequency, days) {
  return Math.round(days / getIntervalDays(frequency));
}

// `now` is injectable purely for deterministic tests; app code omits it.
export function getCalendarWeekStart(weeksAgo, now) {
  const d = now ? new Date(now) : new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - (weeksAgo * 7));
  return d;
}

// Determine when a protocol became active. New protocols carry `assignedAt`
// (written in assignProtocol / bulkAssignProtocol). Legacy protocols predating
// that field fall back to the earliest logged session for the exercise, then to
// the protocol's createdAt, then to null (unknown -> treat as always-active,
// i.e. the original pre-C-1 behaviour).
export function resolveProtocolStart(p, sessions) {
  if (p && p.assignedAt) {
    const a = new Date(p.assignedAt);
    if (!isNaN(a.getTime())) return a;
  }
  if (sessions && sessions.length) {
    let earliest = null;
    for (const s of sessions) {
      if (s.exerciseType !== p.exerciseType) continue;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) continue;
      if (!earliest || d < earliest) earliest = d;
    }
    if (earliest) return earliest;
  }
  if (p && p.createdAt) {
    const c = new Date(p.createdAt);
    if (!isNaN(c.getTime())) return c;
  }
  return null;
}

// opts.now   — inject current time for tests (defaults to real now)
// opts.nameFn — (exerciseType, exerciseName) => display name; app passes exName
export function calcCompliance(sessions, protocols, weeksAgo, opts) {
  opts = opts || {};
  if (weeksAgo === undefined) weeksAgo = 0;
  if (!protocols || protocols.length === 0) return { overall: 0, exercises: [] };

  const now = opts.now ? new Date(opts.now) : new Date();
  const nameFn = opts.nameFn;
  const weekStart = getCalendarWeekStart(weeksAgo, now);
  const weekEnd = weeksAgo === 0 ? now : new Date(weekStart.getTime() + 7 * 86400000);

  const recent = (sessions || []).filter(function(s) {
    const d = new Date(s.date);
    return d >= weekStart && d < weekEnd;
  });

  const exercises = protocols.map(function(p) {
    const start = resolveProtocolStart(p, sessions || []);
    // Protocol was not yet assigned during this window — it was not active, so
    // it does not belong in this week's compliance at all.
    if (start && start >= weekEnd) return null;
    // C-1: clamp the expected-session window start to when the protocol began.
    const effStart = (start && start > weekStart) ? start : weekStart;
    // Day-one grace: count only FULLY ELAPSED days. The in-progress day isn't over,
    // so a plan assigned today expects nothing yet — otherwise a patient who got
    // their plan an hour ago instantly reads as "1 missed" and a red 0%.
    const daysElapsed = Math.floor((weekEnd - effStart) / 86400000);
    const expected = getExpectedSessions(p.frequency, daysElapsed);
    const actual = recent.filter(function(s) { return s.exerciseType === p.exerciseType; }).length;
    // Nothing due yet and nothing logged -> neutral "just started", not 0%.
    const justStarted = expected === 0 && actual === 0;
    const capped = Math.min(actual, Math.max(expected, 1));
    const pct = expected > 0 ? Math.round((capped / expected) * 100) : (actual > 0 ? 100 : 0);
    const missed = Math.max(0, expected - actual);
    return {
      name: nameFn ? nameFn(p.exerciseType, p.exerciseName) : (p.exerciseName || p.exerciseType),
      type: p.exerciseType,
      expected: expected,
      actual: actual,
      missed: missed,
      pct: pct,
      justStarted: justStarted
    };
  }).filter(Boolean);

  // Brand-new plans aren't scoreable yet, so they don't drag the average down.
  const scored = exercises.filter(function(e) { return !e.justStarted; });
  const overall = scored.length > 0
    ? Math.round(scored.reduce(function(sum, e) { return sum + e.pct; }, 0) / scored.length)
    : 0;
  // Nothing scoreable yet (every plan is brand-new) -> callers show a neutral state
  // instead of a misleading 0%.
  const justStarted = exercises.length > 0 && scored.length === 0;
  return { overall: overall, exercises: exercises, justStarted: justStarted };
}

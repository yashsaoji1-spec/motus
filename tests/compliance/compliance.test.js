import { describe, it, expect } from 'vitest';
import {
  calcCompliance,
  resolveProtocolStart,
  getCalendarWeekStart,
  getExpectedSessions,
} from '../../code/compliance.js';

// Fixed reference "now": Wednesday 2026-07-08 12:00 local. Its calendar week
// starts Monday 2026-07-06. All tests inject this via opts.now for determinism.
const NOW = new Date('2026-07-08T12:00:00');
const MON = new Date('2026-07-06T00:00:00');

describe('week boundaries', () => {
  it('getCalendarWeekStart returns the Monday of the current week', () => {
    expect(getCalendarWeekStart(0, NOW).getTime()).toBe(MON.getTime());
  });
  it('getExpectedSessions rounds days / interval', () => {
    expect(getExpectedSessions('daily', 3)).toBe(3);
    expect(getExpectedSessions('every_other', 4)).toBe(2);
    expect(getExpectedSessions('three_week', 7)).toBe(3);
  });
});

describe('C-1: mid-week-assigned plans do not show fake "missed"', () => {
  it('clamps the expected window to assignedAt so a same-day plan is not red', () => {
    // Daily plan assigned this morning; patient logged today's session.
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-07-08T09:00:00' }];
    const sessions = [{ exerciseType: 'squat', date: '2026-07-08T09:30:00' }];
    const { overall, exercises } = calcCompliance(sessions, protocols, 0, { now: NOW });
    // Day-one grace: today is still in progress, so nothing is "expected" yet...
    expect(exercises[0].expected).toBe(0);
    // ...but they logged one anyway, so they read as on track (not "just started").
    expect(exercises[0].justStarted).toBe(false);
    expect(exercises[0].missed).toBe(0);
    expect(exercises[0].pct).toBe(100);
    expect(overall).toBe(100);
  });

  it('an established plan accrues expected/missed for fully elapsed days only', () => {
    // Same patient/sessions, but the plan existed since Monday. Mon+Tue have fully
    // elapsed (2 expected); Wednesday is still in progress so it is not counted.
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-07-06T00:00:00' }];
    const sessions = [{ exerciseType: 'squat', date: '2026-07-08T09:30:00' }];
    const { exercises } = calcCompliance(sessions, protocols, 0, { now: NOW });
    expect(exercises[0].expected).toBe(2); // Mon-Tue, NOT today
    expect(exercises[0].missed).toBe(1);
  });

  it('does not regress established plans assigned before this week', () => {
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-06-01T00:00:00' }];
    const sessions = [
      { exerciseType: 'squat', date: '2026-07-06T08:00:00' },
      { exerciseType: 'squat', date: '2026-07-07T08:00:00' },
      { exerciseType: 'squat', date: '2026-07-08T08:00:00' },
    ];
    const { exercises, overall } = calcCompliance(sessions, protocols, 0, { now: NOW });
    expect(exercises[0].expected).toBe(2); // Mon-Tue fully elapsed; today in progress
    expect(exercises[0].actual).toBe(3);
    expect(overall).toBe(100);            // ahead of pace still caps at 100
  });
});

describe('day-one grace: a brand-new plan is "just started", not a red 0%', () => {
  it('a plan assigned today with nothing logged yet is justStarted, not 0% / 1 missed', () => {
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-07-08T09:00:00' }];
    const result = calcCompliance([], protocols, 0, { now: NOW });
    expect(result.exercises[0].expected).toBe(0);
    expect(result.exercises[0].missed).toBe(0);      // has not missed anything yet
    expect(result.exercises[0].justStarted).toBe(true);
    expect(result.justStarted).toBe(true);           // nothing scoreable -> UI shows neutral
  });

  it('becomes scoreable once a full day has elapsed', () => {
    // Assigned Tuesday morning; by Wednesday noon one full day has passed.
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-07-07T09:00:00' }];
    const result = calcCompliance([], protocols, 0, { now: NOW });
    expect(result.exercises[0].expected).toBe(1);
    expect(result.exercises[0].missed).toBe(1);      // now genuinely missed
    expect(result.exercises[0].justStarted).toBe(false);
    expect(result.justStarted).toBe(false);
  });

  it('a brand-new plan does not drag down the average of an established one', () => {
    const protocols = [
      { exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-06-01T00:00:00' }, // established, on track
      { exerciseType: 'lunge', frequency: 'daily', assignedAt: '2026-07-08T09:00:00' }, // assigned today
    ];
    const sessions = [
      { exerciseType: 'squat', date: '2026-07-06T08:00:00' },
      { exerciseType: 'squat', date: '2026-07-07T08:00:00' },
    ];
    const { overall, justStarted } = calcCompliance(sessions, protocols, 0, { now: NOW });
    expect(overall).toBe(100);       // the just-started lunge is excluded, not scored as 0
    expect(justStarted).toBe(false); // something IS scoreable
  });
});

describe('C-1: legacy protocols without assignedAt', () => {
  it('falls back to the earliest logged session for the exercise', () => {
    const p = { exerciseType: 'lunge', frequency: 'daily' };
    const sessions = [
      { exerciseType: 'lunge', date: '2026-07-08T07:00:00' },
      { exerciseType: 'lunge', date: '2026-07-08T19:00:00' },
    ];
    expect(resolveProtocolStart(p, sessions).getTime())
      .toBe(new Date('2026-07-08T07:00:00').getTime());
  });

  it('falls back to createdAt when there are no sessions', () => {
    const p = { exerciseType: 'lunge', frequency: 'daily', createdAt: '2026-07-08T06:00:00' };
    expect(resolveProtocolStart(p, []).getTime())
      .toBe(new Date('2026-07-08T06:00:00').getTime());
  });

  it('returns null (original always-active behaviour) when nothing is known', () => {
    expect(resolveProtocolStart({ exerciseType: 'lunge', frequency: 'daily' }, [])).toBeNull();
  });
});

describe('C-1: prior-week view excludes not-yet-assigned plans', () => {
  it('a plan assigned this week is absent from last week\'s compliance', () => {
    // weeksAgo=1 window is Mon 2026-06-29 .. Mon 2026-07-06.
    const protocols = [{ exerciseType: 'squat', frequency: 'daily', assignedAt: '2026-07-08T09:00:00' }];
    const { exercises, overall } = calcCompliance([], protocols, 1, { now: NOW });
    expect(exercises).toHaveLength(0); // not counted as a 0% red plan
    expect(overall).toBe(0);
  });
});

import { Issue, TimeEntry } from "../types/issue";
import { dateOnly } from "./activity";

// Who logged hours on which of the last working days — "who has not logged time?" on one screen.

const DAY_MS = 86_400_000;

export interface TimesheetPerson {
  name: string;
  hoursByDay: Record<string, number>;
  /** Hours over the days shown. */
  total: number;
  daysLogged: number;
  missingDays: number;
  /** Days with more hours than `maxDailyHours`. */
  overDays: number;
  /** Share of (days shown x hours per day) actually logged. */
  capacityPercent: number;
  /** The last day they logged anything (even before the days shown). */
  lastLogged: string | null;
  openTickets: number;
}

export interface Timesheet {
  days: string[]; // oldest first
  people: TimesheetPerson[];
}

/** The last `count` Monday–Friday dates up to and including `endDate`, oldest first. */
export function lastWorkingDays(endDate: string, count: number): string[] {
  const days: string[] = [];
  let day = Math.floor(Date.parse(`${dateOnly(endDate)}T00:00:00Z`) / DAY_MS);
  while (days.length < count && day > 0) {
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(new Date(day * DAY_MS).toISOString().slice(0, 10));
    day -= 1;
  }
  return days.reverse();
}

/**
 * One row per person who logged time in the data, or who has an open ticket (so someone with work
 * and no hours shows up as all-missing rather than not at all).
 */
export function buildTimesheet(
  entries: TimeEntry[],
  issues: Issue[],
  endDate: string,
  workingDays = 10,
  hoursPerDay = 6,
  maxDailyHours = 10
): Timesheet {
  const days = lastWorkingDays(endDate, workingDays);
  const daySet = new Set(days);
  const people = new Map<string, TimesheetPerson>();
  const person = (name: string): TimesheetPerson => {
    let p = people.get(name.toLowerCase());
    if (!p) {
      p = { name, hoursByDay: {}, total: 0, daysLogged: 0, missingDays: 0, overDays: 0, capacityPercent: 0, lastLogged: null, openTickets: 0 };
      people.set(name.toLowerCase(), p);
    }
    return p;
  };

  for (const e of entries) {
    const p = person(e.user);
    const day = dateOnly(e.spentOn);
    if (p.lastLogged === null || day > p.lastLogged) p.lastLogged = day;
    if (daySet.has(day)) p.hoursByDay[day] = (p.hoursByDay[day] ?? 0) + e.hours;
  }
  for (const issue of issues) {
    if (issue.statusIsClosed) continue;
    const names = new Set<string>();
    if (issue.assignedTo) names.add(issue.assignedTo);
    for (const a of issue.additionalAssignees ?? []) names.add(a.name);
    for (const n of names) person(n).openTickets += 1;
  }

  for (const p of people.values()) {
    for (const day of days) {
      const hours = p.hoursByDay[day] ?? 0;
      p.total += hours;
      if (hours > 0) p.daysLogged += 1;
      else p.missingDays += 1;
      if (hours > maxDailyHours) p.overDays += 1;
    }
    p.total = Math.round(p.total * 100) / 100;
    p.capacityPercent = days.length > 0 && hoursPerDay > 0 ? (p.total / (days.length * hoursPerDay)) * 100 : 0;
  }

  const roster = [...people.values()].filter((p) => p.openTickets > 0 || p.lastLogged !== null);
  roster.sort((a, b) => b.missingDays - a.missingDays || b.openTickets - a.openTickets || a.name.localeCompare(b.name));
  return { days, people: roster };
}

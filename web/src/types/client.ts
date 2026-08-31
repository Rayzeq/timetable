import type { ITimetableHeader, ITimetableLesson } from "./api";

/**
 * lesson enriched once at ingest so the hot paths - day splitting, widget
 * selection, "currently in lesson" checks - compare plain numbers instead
 * of parsing iso strings over and over.
 */
export interface IClientLesson extends ITimetableLesson {
  /** epoch milliseconds of `start_date`. */
  start_ts: number;
  /** epoch milliseconds of `end_date`. */
  end_ts: number;
  /** monday = 1 ... sunday = 7, same convention as luxon. */
  weekday: number;
}

export interface IClientTimetable {
  header: ITimetableHeader;
  lessons: IClientLesson[];
  last_update: string;
}

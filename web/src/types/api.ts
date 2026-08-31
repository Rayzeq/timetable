// json shapes returned by the rust api, mirroring the
// unilim-edt-iut-info crate models.

export type LessonType = "CM" | "TD" | "TP" | "DS" | "SAE" | "OTHER";

export interface ITimetableLessonContent {
  /** normalized lesson name from the but references, when known. */
  lesson_from_reference?: string;
  /** raw lesson name as written in the calendar. */
  raw_lesson?: string;
  /** free-form description, only on OTHER lessons. */
  description?: string;
  room: string;
  teacher: string;
  /** lesson code, ex.: "R1.01". */
  type?: string;
}

export interface ITimetableLessonGroup {
  main: number;
  /** `0` = subgroup A, `1` = subgroup B, absent when for the whole group. */
  sub?: number;
}

export interface ITimetableLesson {
  /** iso string, parse with `new Date(...)`. */
  start_date: string;
  /** iso string, parse with `new Date(...)`. */
  end_date: string;
  type: LessonType;
  content: ITimetableLessonContent;
  group?: ITimetableLessonGroup;
}

export interface ITimetableHeader {
  /** iso string, parse with `new Date(...)`. */
  start_date: string;
  /** iso string, parse with `new Date(...)`. */
  end_date: string;
  /** week number in the published files, ex.: S13. */
  week_number: number;
  /** iso week number in the year. */
  week_number_in_year: number;
}

export interface ITimetable {
  header: ITimetableHeader;
  lessons: ITimetableLesson[];
  /** last update made to the timetable, iso string. */
  last_update: string;
}

export interface ApiTimetableMeta {
  success: true;
  data: Array<ITimetableHeader & { last_update: string }>;
}

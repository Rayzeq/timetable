export type LessonType = "CM" | "CM/TD" | "TD" | "TP" | "Évaluation" | "Férié" | "Autre";

export interface ApiEvent {
  start: string;
  end: string;
  title: string;
  type: string;
}

export interface ApiEventsResponse {
  name: string;
  events: ApiEvent[];
}

export interface ITimetableLessonContent {
  is_cancelled?: boolean;
  lesson_name?: string;
  description?: string;
  room: string;
  teacher: string;
  group?: string;
  type?: string;
}

export interface ITimetableLesson {
  start_date: string;
  end_date: string;
  type: LessonType;
  content: ITimetableLessonContent;
}

export interface ITimetableHeader {
  start_date: string;
  end_date: string;
  week_number: number;
  week_number_in_year: number;
}

export interface ITimetable {
  header: ITimetableHeader;
  lessons: ITimetableLesson[];
  last_update: string;
}

export interface ApiTimetableMeta {
  success: true;
  data: Array<ITimetableHeader & { last_update: string }>;
}

export interface ApiTimetableResponse {
  success: true;
  data: ApiEventsResponse;
}

import type { ITimetable, ITimetableLesson } from "~/types/api";
import type { IClientLesson, IClientTimetable } from "~/types/client";

export const normalizeLesson = (lesson: ITimetableLesson): IClientLesson => {
  const start = new Date(lesson.start_date);
  const day = start.getDay();

  return {
    ...lesson,
    start_ts: start.getTime(),
    end_ts: new Date(lesson.end_date).getTime(),
    weekday: day === 0 ? 7 : day
  };
};

export const normalizeTimetable = (timetable: ITimetable): IClientTimetable => ({
  header: timetable.header,
  lessons: timetable.lessons.map(normalizeLesson),
  last_update: timetable.last_update
});

export const normalizeAndMergeLessons = (lessons: IClientLesson[]): IClientLesson[] => {
  return lessons
    .map(lesson => ({ ...lesson }))
    .sort((a, b) => a.start_ts - b.start_ts)
    .reduce((acc, lesson) => {
      const previousLesson = acc[acc.length - 1];

      if (previousLesson) {
        if (previousLesson.weekday !== lesson.weekday || previousLesson.end_ts !== lesson.start_ts) {
          acc.push(lesson);
          return acc;
        }

        const isSameContentType = getLessonContentType(previousLesson) === getLessonContentType(lesson);
        const isSameType = previousLesson.type === lesson.type;
        const isSameRoom = previousLesson.content.room === lesson.content.room;
        const isSameTeacher = previousLesson.content.teacher === lesson.content.teacher;

        if (isSameContentType && isSameType && isSameRoom && isSameTeacher) {
          previousLesson.end_date = lesson.end_date;
          previousLesson.end_ts = lesson.end_ts;
          return acc;
        }
      }

      acc.push(lesson);
      return acc;
    }, [] as IClientLesson[]);
};

export const splitLessonsByWeekday = (lessons: IClientLesson[]): IClientLesson[][] => {
  const days: IClientLesson[][] = [[], [], [], [], [], [], []];
  for (const lesson of lessons) {
    days[lesson.weekday - 1].push(lesson);
  }
  return days;
};

export const getLessonDescription = (lesson: ITimetableLesson): string => (
  lesson.content.lesson_name
  || lesson.content.description
  || "(Inconnu)"
);

export const getLessonContentType = (lesson: ITimetableLesson): string => (
  lesson.content.type ?? "??"
);

export const makeLessonUniqueID = (lesson: ITimetableLesson): string => (
  btoa(`${lesson.start_date}-${lesson.end_date}-${lesson.content.room}-${lesson.content.teacher}`)
);

export const getFullLessonContentType = (lesson: ITimetableLesson): string => {
  switch (lesson.type) {
    case "CM":
      return "Cours magistral";

    case "TD":
      return "Travaux dirigés";

    case "TP":
      return "Travaux pratiques";

    case "Évaluation":
      return "Devoir surveillé";

    case "Férié":
      return "Jour férié";

    case "Autre":
      return getLessonContentType(lesson);

    default:
      return "Inconnu";
  }
};

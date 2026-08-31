import type { ITimetable, ITimetableLesson } from "~/types/api";
import type { IClientLesson, IClientTimetable } from "~/types/client";

export const SUBGROUP_A = 0;

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

/** enrich a wire timetable once so every consumer works on numbers. */
export const normalizeTimetable = (timetable: ITimetable): IClientTimetable => ({
  header: timetable.header,
  lessons: timetable.lessons.map(normalizeLesson),
  last_update: timetable.last_update
});

export const lessonsForSubGroup = (timetable: Pick<IClientTimetable, "header" | "lessons">, preferences: {
  main_group: number
  sub_group: 0 | 1;
}) => {
  const lessons = timetable.lessons.filter(lesson => {
    let isForUser = false;

    switch (lesson.type) {
      case "TP":
        isForUser = lesson.group?.sub === preferences.sub_group && lesson.group?.main === preferences.main_group;
        break;

      case "TD":
      case "DS":
      case "SAE":
        // It's for everyone.
        if (typeof lesson.group === "undefined") {
          isForUser = true;
          break;
        }
        // There's a specific subgroup, can happen on SAEs.
        else if (lesson.type === "SAE" && typeof lesson.group.sub !== "undefined") {
          // So in that case we should check for main group and subgroup.
          isForUser = lesson.group.main === preferences.main_group && lesson.group.sub === preferences.sub_group;
          break;
        }
        // Otherwise, we just check for the main group.
        else {
          isForUser = lesson.group.main === preferences.main_group;
          break;
        }

      // Since CM lessons are for the whole year, we don't
      // need to check any group and/or subgroup.
      case "CM":
      case "OTHER":
        isForUser = true;
        break;
    }

    return isForUser;
  })
    // shallow copies - the merge below mutates end dates.
    .map(lesson => ({ ...lesson }))
    .sort((a, b) => a.start_ts - b.start_ts)
    // Remove the lessons that are the same as the previous one
    // and update the `end_date` of the previous lesson to the `end_date` of the current lesson.
    .reduce((acc, lesson) => {
      const previousLesson = acc[acc.length - 1];

      if (previousLesson) {
        // if not same day or not right after the previous one, don't merge.
        if (previousLesson.weekday !== lesson.weekday || previousLesson.end_ts !== lesson.start_ts) {
          acc.push(lesson);
          return acc;
        }

        const isSameContentType = getLessonContentType(previousLesson) === getLessonContentType(lesson);
        const isSameType = previousLesson.type === lesson.type;
        const isSameRoom = previousLesson.content.room === lesson.content.room;
        const isSameTeacher = previousLesson.content.teacher === lesson.content.teacher;

        // Extend the previous lesson's end date to the current lesson's end date
        // when a lesson is the same as the previous one.
        if (isSameContentType && isSameType && isSameRoom && isSameTeacher) {
          previousLesson.end_date = lesson.end_date;
          previousLesson.end_ts = lesson.end_ts;
          return acc;
        }
      }

      acc.push(lesson);
      return acc;
    }, [] as IClientLesson[]);

  return lessons;
};

/** one bucket per weekday, monday first - a single pass instead of seven filters. */
export const splitLessonsByWeekday = (lessons: IClientLesson[]): IClientLesson[][] => {
  const days: IClientLesson[][] = [[], [], [], [], [], [], []];
  for (const lesson of lessons) {
    days[lesson.weekday - 1].push(lesson);
  }
  return days;
};

export const getLessonDescription = (lesson: ITimetableLesson): string => (
  lesson.content.lesson_from_reference
  || lesson.content.raw_lesson
  || lesson.content.description
  || "(Inconnu)"
);

export const getLessonContentType = (lesson: ITimetableLesson): string => (
  lesson.content.type ?? "??"
);

export const makeLessonUniqueID = (lesson: ITimetableLesson): string => (
  btoa(`${lesson.start_date}-${lesson.end_date}-${lesson.content.room}-${lesson.content.teacher}`)
);

export const getLessonGroup = (lesson: ITimetableLesson, year: number): string => {
  switch (lesson.type) {
    case "TP":
      return `G${lesson.group?.main}${lesson.group?.sub === SUBGROUP_A ? "A" : "B"}`;

    case "TD":
    case "DS":
    case "SAE":
      if (typeof lesson.group === "undefined") {
        return `A${year}`;
      }
      else if (lesson.type === "SAE" && typeof lesson.group.sub !== "undefined") {
        return `G${lesson.group.main}${lesson.group.sub === SUBGROUP_A ? "A" : "B"}`;
      }
      else {
        return `G${lesson.group.main}`;
      }

    case "CM":
    case "OTHER":
      return `A${year}`;
  }
};

export const getFullLessonContentType = (lesson: ITimetableLesson): string => {
  switch (lesson.type) {
    case "CM":
      return "Cours magistral";

    case "TD":
      return "Travaux dirigés";

    case "TP":
      return "Travaux pratiques";

    case "DS":
      return "Devoir surveillé";

    case "SAE":
      return "SAE";

    case "OTHER":
      return getLessonContentType(lesson);

    default:
      return "Inconnu";
  }
};

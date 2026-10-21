import { DateTime } from "luxon";
import { now } from "~/stores/temporary";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";

import type { IDoneForTodayWidget } from "./DoneForToday";
import type { IDoneForWeekWidget } from "./DoneForWeek";
import type { INextLessonWidget } from "./NextLesson";
import type { IOngoingWidget } from "./Ongoing";

export { default as DoneForTodayWidget } from "./DoneForToday";
export { default as DoneForWeekWidget } from "./DoneForWeek";
export { default as NextLessonWidget } from "./NextLesson";
export { default as OngoingWidget } from "./Ongoing";

export type { IDoneForTodayWidget, IDoneForWeekWidget, INextLessonWidget, IOngoingWidget };

export type WidgetContent = IDoneForTodayWidget | IDoneForWeekWidget | INextLessonWidget | IOngoingWidget;

export const getWidgetContent = (data: {
  // Timetable of the current week (from today)
  currentWeekLessons?: IClientLesson[];
  currentWeekHeader?: ITimetableHeader;
  // Timetable of the next week
  nextWeekLessons?: IClientLesson[];
  nextWeekHeader?: ITimetableHeader;
}): WidgetContent | undefined => {
  if (!data.currentWeekLessons) return;

  const currentWeekLessons = data.currentWeekLessons.filter((lesson) => !lesson.content.is_cancelled);
  const nextWeekLessons = data.nextWeekLessons?.filter((lesson) => !lesson.content.is_cancelled);

  const n = now();
  const now_ts = n.toMillis();

  /**
   * Note that the lessons are sorted by default.
   * So first item will be the first lesson of the day and so on.
   */
  const lessonsForCurrentDay = currentWeekLessons.filter((lesson) => lesson.weekday === n.weekday);
  const lessonsForNextDay = data.currentWeekLessons.filter((lesson) => lesson.weekday === n.weekday + 1);

  // Check if we're done for the week.
  const lastLessonOfWeek = currentWeekLessons[currentWeekLessons.length - 1];
  let isDoneForWeek: boolean;
  if (!lastLessonOfWeek) isDoneForWeek = true;
  else isDoneForWeek = now_ts >= lastLessonOfWeek.end_ts;

  if (!isDoneForWeek) {
    // Check if we're after the last lesson.
    const lastLessonOfDay = lessonsForCurrentDay[lessonsForCurrentDay.length - 1];
    let isDoneForToday: boolean;
    if (!lastLessonOfDay) isDoneForToday = true;
    else isDoneForToday = now_ts >= lastLessonOfDay.end_ts;

    if (isDoneForToday)
      return {
        type: "DONE_FOR_TODAY",
        next_lesson: lessonsForNextDay[0],
      };
    else {
      // Check if we're at the beginning of the day.
      const first_lesson_of_day = lessonsForCurrentDay[0];
      if (now_ts < first_lesson_of_day.start_ts)
        return {
          type: "NEXT_LESSON",
          lesson: first_lesson_of_day,
        };
      // We're currently in a lesson.
      else {
        const current_lesson_index = lessonsForCurrentDay.findIndex((lesson) => now_ts >= lesson.start_ts && now_ts < lesson.end_ts);

        if (current_lesson_index !== -1) {
          const current_lesson = lessonsForCurrentDay[current_lesson_index];

          // Check if we're currently on the last lesson.
          if (current_lesson_index === lessonsForCurrentDay.length - 1)
            return {
              type: "ONGOING",
              lesson: current_lesson,
            };
          else
            return {
              type: "ONGOING",
              lesson: current_lesson,
              next_lesson: lessonsForCurrentDay[current_lesson_index + 1],
            };
        }
        // we're in a break, we should get the very next lesson
        else {
          // get the very first occurrence after now (so the next lesson)
          const next_lesson = lessonsForCurrentDay.find((lesson) => lesson.start_ts >= now_ts);

          if (!next_lesson) {
            // throw debug informations in case someone reports.
            console.error("debug: what should happen here ?", n.toISO(), JSON.stringify(lessonsForCurrentDay));
            return;
          }

          return {
            type: "NEXT_LESSON",
            lesson: next_lesson,
          };
        }
      }
    }
  } else {
    // still loading but we know we're done for week.
    if (!data.nextWeekHeader || typeof nextWeekLessons === "undefined")
      return {
        type: "DONE_FOR_WEEK",
        loading: true,
      };

    let is_vacation = false;
    if (data.currentWeekHeader && data.nextWeekHeader) {
      const endCurrent = DateTime.fromISO(data.currentWeekHeader.end_date);
      const startNext = DateTime.fromISO(data.nextWeekHeader.start_date);
      const diffDays = startNext.diff(endCurrent, "days").days;
      if (diffDays > 7) {
        is_vacation = true;
      }
    }

    if (!is_vacation) {
      return {
        type: "DONE_FOR_WEEK",
        loading: false,
        is_vacation: false,
        next_week_lesson: nextWeekLessons[0],
      };
    }
    // if there's a gap, then it's vacations tbh
    else
      return {
        type: "DONE_FOR_WEEK",
        loading: false,
        is_vacation: true,
      };
  }
};

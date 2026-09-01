import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import { createWindowSize } from "~/primitives/window-size";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";

import { getDayFromTimetable, getDayString, getHourString } from "~/utils/dates";
import { TIMETABLE_HOURS } from "~/utils/hours";
import { getLessonDescription } from "~/utils/lessons";

import MdiCheck from "~icons/mdi/check";
import { setLessonModalData } from "../modals/Lesson";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";

const FixedHeightDayTimetableLesson: Component<{
  lessons: IClientLesson[]
  lesson?: IClientLesson
}> = (props) => {
  const windowSize = createWindowSize();
  const lessonHeight = () => ((windowSize.height - 48) / TIMETABLE_HOURS.length);

  const lesson_before = (): IClientLesson | undefined => {
    const lessonIndex = props.lessons.findIndex(
      (lesson) => lesson.start_ts === props.lesson?.start_ts
    );

    if (lessonIndex === -1) return;
    return props.lessons[lessonIndex - 1];
  };

  const currentDurationLength = () => {
    if (!props.lesson) return 0;
    const start_hour = getHourString(new Date(props.lesson.start_ts));
    const end_hour = getHourString(new Date(props.lesson.end_ts));

    const start_index = TIMETABLE_HOURS.findIndex((hour) => hour === start_hour);
    const end_index = TIMETABLE_HOURS.findIndex((hour) => hour === end_hour);

    return end_index - start_index;
  };

  const thereIsBreakBefore = (): boolean => {
    if (!props.lesson) return false;
    const l_before = lesson_before();
    // Start of day so we say there's a break.
    if (!l_before) return true;

    return l_before.end_ts !== props.lesson.start_ts;
  };

  const breakDurationLength = () => {
    if (!props.lesson) return 0;

    let end_index = 0; // When there's no lesson before, it's the start of day.
    const l_before = lesson_before();
    if (l_before) {
      const end_hour = getHourString(new Date(l_before.end_ts));
      end_index = TIMETABLE_HOURS.findIndex((hour) => hour === end_hour);
    }

    const start_hour = getHourString(new Date(props.lesson.start_ts));
    const start_index = TIMETABLE_HOURS.findIndex((hour) => hour === start_hour);

    return start_index - end_index;
  };

  const isCurrentlyInLesson = createMemo(() => {
    if (!props.lesson) return false;
    const now_ts = now().toMillis();
    return now_ts < props.lesson.end_ts && now_ts >= props.lesson.start_ts;
  });

  return (
    <Show when={props.lesson}>
      {lesson => (
        <>
          <Show when={thereIsBreakBefore() && breakDurationLength()}>
            <div style={{
              height: (lessonHeight() * breakDurationLength()) + "px"
            }} />
          </Show>

          <button type="button"
            class={["focusable-lesson-for-swiper w-full text-left flex border-t border-t-red select-none transition-colors cursor-pointer overflow-hidden", isCurrentlyInLesson()
              ? "bg-[rgb(42,42,42)]"
              : "bg-[rgb(30,30,30)] hover:bg-[rgb(34,34,34)]"]}
            style={{
              height: (lessonHeight() * currentDurationLength()) + "px"
            }}
            onClick={() => setLessonModalData(lesson())}
          >
            <div class="w-full flex justify-between px-4 pt-2 gap-4">
              <p class={["text-[rgb(240,240,240)]", currentDurationLength() > 1 ? "text-sm" : "text-xs"]}>
                <span class="text-red font-medium">{lesson().type}</span> : {getLessonDescription(lesson())}
              </p>
              <div class="flex gap-2.5 pt-2px">
                <Show when={isCurrentlyInLesson()}>
                  <div class="size-4px rd-full bg-red mr-4px animate-ping" />
                </Show>
                <p class={["bg-red rounded-full font-medium px-3 h-fit", currentDurationLength() > 1 ? "text-sm py-.5" : "text-xs py-0"]}
                  style={{ color: textColorOnBG() }}
                >
                  {lesson().content.room}
                </p>
              </div>
            </div>
          </button>
        </>
      )}
    </Show>
  );
};

const FixedHeightDayTimetable: Component<{
  header: ITimetableHeader;
  lessons: IClientLesson[];
  isToday: boolean;
  dayIndex: number;
}> = (props) => {
  const day = () => getDayFromTimetable(props.header, props.dayIndex);

  /**
   * Find the lesson for the given hour.
   * @param hour_from_ref The hour to find the lesson for. Format: `HH:MM`.
   */
  const findLessonForGivenHour = (hour_from_ref: string): IClientLesson | undefined => {
    const lesson = props.lessons.find(
      (lesson) => getHourString(new Date(lesson.start_ts)) === hour_from_ref
    );

    return lesson;
  };

  return (
    <div class="w-full relative pt-6">
      <div class="absolute top-3 left-0 right-0">
        <div class="w-fit mx-auto bg-red px-4 py-1 rounded-full">
          <p class="text-sm font-medium"
            style={{ color: textColorOnBG() }}
          >
            {getDayString(day())}
          </p>
        </div>
      </div>

      <div class={["h-[calc(100vh-48px)] rounded-lg py-6 mx-2 overflow-hidden", props.isToday && "border-2 border-red"]}>
        <For each={TIMETABLE_HOURS} fallback={
          <div class="flex flex-col gap-2 items-center pt-4">
            <MdiCheck class="text-2xl text-[rgb(240,240,240)]" />
            <p class="text-[rgb(200,200,200)]">
              Pas de cours !
            </p>
          </div>
        }>
          {(hour) => (
            <FixedHeightDayTimetableLesson
              lessons={props.lessons}
              lesson={findLessonForGivenHour(hour)}
            />
          )}
        </For>
      </div>
    </div>
  );
};

export default FixedHeightDayTimetable;

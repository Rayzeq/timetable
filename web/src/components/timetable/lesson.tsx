import { Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { IClientLesson } from "~/types/client";

import { getHourString, hoursAndMinutesBetween } from "~/utils/dates";
import { getLessonContentType } from "~/utils/lessons";

import MdiTimerSandFull from "~icons/mdi/timer-sand-full";
import { setLessonModalData } from "../modals/Lesson";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";
import { shortToFullTeacherName } from "~/utils/teachers";

const MobileDayTimetableLesson: Component<{
  lesson: IClientLesson;
  /** Whether the lesson is the last of the day or no. */
  is_last_lesson: boolean;
  /** The lesson that is right before this one. */
  lesson_before?: IClientLesson;
}> = (props) => {
  const start = () => new Date(props.lesson.start_ts);

  const thereIsBreakBefore = (): boolean => {
    if (!props.lesson_before) return false;
    return props.lesson_before.end_ts !== props.lesson.start_ts;
  };

  const isCurrentlyInLesson = createMemo(() => {
    const now_ts = now().toMillis();
    return now_ts < props.lesson.end_ts && now_ts >= props.lesson.start_ts;
  });

  const isCancelled = () => props.lesson.content.is_cancelled;
  const lessonName = () => props.lesson.content.lesson_name || getLessonContentType(props.lesson);
  const description = () => props.lesson.content.description;
  const teacherName = () => shortToFullTeacherName(props.lesson.content.teacher)?.name ?? props.lesson.content.teacher;
  const groupName = () => props.lesson.content.group;

  const Delimiter: Component<{ date: Date; }> = (props) => (
    <div class="flex items-center gap-2">
      <span class="h-[1px] w-4 border-b border-b-[rgb(62,62,62)]" />

      <p class="flex-shrink-0 text-[rgb(168,168,168)]">
        {getHourString(props.date)}
      </p>

      <span class="h-[1px] w-full border-b border-b-[rgb(62,62,62)]" />
    </div>
  );

  return (
    <>
      <Show when={thereIsBreakBefore()}>
        <Delimiter date={new Date(props.lesson_before!.end_ts)} />

        <div class="flex justify-center items-center gap-6 py-4 text-[rgb(168,168,168)]">
          <MdiTimerSandFull />
          <p>
            {hoursAndMinutesBetween(start(), new Date(props.lesson_before!.end_ts))} de vide
          </p>
        </div>
      </Show>

      <Delimiter date={start()} />

      <button type="button" class="focusable-lesson-for-swiper w-full text-left select-none py-1 cursor-pointer"
        onClick={() => setLessonModalData(props.lesson)}
      >
        <div class={[
          "flex flex-col gap-2 py-2.5 px-4 transition-colors",
          isCancelled() ? "bg-red/25 border-l-4 border-l-red" : "hover:bg-[rgb(28,28,28)]",
          { "bg-red/8": isCurrentlyInLesson() && !isCancelled() }
        ]}>
          <div class="flex justify-between gap-2 items-start">
            <div class="flex flex-col gap-0.5 min-w-0 flex-1">
              <h2 class={["text-lg font-medium text-[rgb(240,240,240)] break-words", isCancelled() && "line-through opacity-80"]}>
                {lessonName()}
              </h2>
              <Show when={description()}>
                <p class="text-xs text-[rgb(170,170,170)] break-words">
                  {description()}
                </p>
              </Show>
            </div>

            <div class="flex gap-2.5 items-center flex-shrink-0">
              <Show when={isCancelled()}>
                <p class="text-xs border border-red text-red bg-red/20 rounded-full px-2 py-0.5 font-bold">
                  ANNULÉ
                </p>
              </Show>
              <Show when={isCurrentlyInLesson() && !isCancelled()}>
                <div class="size-4px rd-full bg-red mr-4px animate-ping" />
              </Show>

              <p class="text-sm border border-red text-red bg-red/10 rounded-full px-3 py-0.5 h-fit">
                {props.lesson.type}
              </p>
              <Show when={props.lesson.content.room}>
                <p class="text-sm bg-red rounded-full font-medium px-3 py-0.5 h-fit"
                  style={{ color: textColorOnBG() }}
                >
                  {props.lesson.content.room}
                </p>
              </Show>
            </div>
          </div>

          <div class="text-sm text-[rgb(190,190,190)] pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 break-words">
            <span>Enseignant : {teacherName()}</span>
            <Show when={groupName()}>
              <span class="text-xs bg-[rgb(50,50,50)] px-2 py-0.5 rounded text-[rgb(210,210,210)]">
                {groupName()}
              </span>
            </Show>
          </div>
        </div>
      </button>

      <Show when={props.is_last_lesson}>
        <Delimiter date={new Date(props.lesson.end_ts)} />
      </Show>
    </>
  );
};

export default MobileDayTimetableLesson;

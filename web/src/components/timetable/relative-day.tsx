import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";

import MobileDayTimetableLesson from "./lesson";
import { getDayFromTimetable, getDayString } from "~/utils/dates";

import MdiCheck from "~icons/mdi/check";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";

const MobileDayTimetable: Component<{
  header: ITimetableHeader;
  lessons: IClientLesson[];
  isToday: boolean;
  dayIndex: number;
}> = (props) => {
  const day = () => getDayFromTimetable(props.header, props.dayIndex);

  const dayIsDone = createMemo(() => {
    // if there's no lessons, it's always `true`.
    if (props.lessons.length === 0) return true;

    const lastLesson = props.lessons[props.lessons.length - 1];
    // if we don't find the last lesson, it means there's nothing so `true`.
    if (!lastLesson) return true;

    return now().toMillis() >= lastLesson.end_ts;
  });

  return (
    <div class="w-full relative pt-6">
      <div class="absolute top-3 left-0 right-0 z-20">
        <div class="w-fit mx-auto bg-red px-4 py-1 rounded-full">
          <p class={["text-sm", { "font-medium": textColorOnBG() === "black" }]}
            style={{ color: textColorOnBG() }}
          >
            {getDayString(day())}
          </p>
        </div>
      </div>

      <div class={["bg-[rgb(21,21,21)] rounded-lg py-6 mx-4 relative", props.isToday && "border-2 border-red"]}>
        <Show when={props.lessons.some(l => l.type === "Férié")}
          fallback={
            <For each={props.lessons} fallback={
              <div class="flex flex-col gap-2 items-center pt-4">
                <MdiCheck class="text-2xl text-[rgb(240,240,240)]" />
                <p class="text-[rgb(200,200,200)]">
                  Pas de cours !
                </p>
              </div>
            }>
              {(lesson, lessonIndex) => (
                <MobileDayTimetableLesson
                  lesson={lesson}
                  is_last_lesson={lessonIndex() === props.lessons.length - 1}
                  // We check if the lesson is the first one of the day or not.
                  // If yes, give `undefined` directly.
                  lesson_before={lessonIndex() !== 0 ? props.lessons[lessonIndex() - 1] : undefined}
                />
              )}
            </For>
          }
        >
          <div class="flex flex-col gap-2 items-center justify-center py-10 px-4 text-center">
            <p class="text-lg font-medium text-red">Jour férié 🎉</p>
            <p class="text-sm text-[rgb(190,190,190)]">Aucun cours aujourd'hui (férié).</p>
          </div>
        </Show>

        <Show when={props.isToday && props.lessons.length > 0 && dayIsDone() && !props.lessons.some(l => l.type === "Férié")}>
          <div class="flex p-4 gap-2 items-center justify-center text-red bg-red/15 mt-2">
            <MdiCheck class="text-xl" />
            <p>La journée est terminée !</p>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default MobileDayTimetable;

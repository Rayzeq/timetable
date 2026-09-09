import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { createWindowSize } from "~/primitives/window-size";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";
import { getDayFromTimetable, getDayString, getHourString } from "~/utils/dates";
import { TIMETABLE_HOURS } from "~/utils/hours";
import { getLessonContentType } from "~/utils/lessons";
import MdiCheck from "~icons/mdi/check";
import { setLessonModalData } from "../modals/Lesson";

const FixedHeightDayTimetableLesson: Component<{
  lesson: IClientLesson;
  lessonHeight: number;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
  durationLength: number;
}> = (props) => {
  const now_ts = () => now().toMillis();

  const isCurrentlyInLesson = createMemo(() => {
    const t = now_ts();
    return t < props.lesson.end_ts && t >= props.lesson.start_ts;
  });

  const isCancelled = () => props.lesson.content.is_cancelled;
  const lessonName = () => props.lesson.content.lesson_name || getLessonContentType(props.lesson);
  const description = () => props.lesson.content.description;

  return (
    <div
      class="absolute"
      style={{
        top: `${props.top}px`,
        height: `${props.height}px`,
        left: `calc(${(props.column / props.totalColumns) * 100}% + 2px)`,
        width: `calc(${(1 / props.totalColumns) * 100}% - 4px)`,
      }}
    >
      <button
        type="button"
        class={[
          "focusable-lesson-for-swiper w-full h-full text-left flex border-t border-t-red select-none transition-colors cursor-pointer overflow-hidden rounded",
          isCancelled()
            ? "bg-red/25 border-l-4 border-l-red"
            : isCurrentlyInLesson()
              ? "bg-[rgb(42,42,42)]"
              : "bg-[rgb(30,30,30)] hover:bg-[rgb(34,34,34)]",
        ]}
        onClick={() => setLessonModalData(props.lesson)}
      >
        <div class="w-full flex justify-between px-3 pt-2 gap-2 overflow-hidden">
          <div class="flex flex-col gap-0.5 min-w-0 flex-1 text-left">
            <p
              class={[
                "text-[rgb(240,240,240)] text-left break-words font-medium",
                props.durationLength > 1 ? "text-sm" : "text-xs",
                isCancelled() && "line-through opacity-80",
              ]}
            >
              <span class="text-red font-medium">{props.lesson.type}</span> : {lessonName()}
            </p>
            <Show when={description() && props.durationLength > 1}>
              <p class="text-xs text-[rgb(170,170,170)] text-left truncate">{description()}</p>
            </Show>
          </div>

          <div class="flex gap-1.5 pt-2px flex-shrink-0 items-center">
            <Show when={isCancelled()}>
              <p class="text-[10px] border border-red text-red bg-red/20 rounded px-1 py-0.5 font-bold">ANNULÉ</p>
            </Show>
            <Show when={isCurrentlyInLesson() && !isCancelled()}>
              <div class="size-4px rd-full bg-red mr-4px animate-ping" />
            </Show>
            <Show when={props.lesson.content.room}>
              <p
                class={[
                  "bg-red rounded-full font-medium px-3 h-fit truncate max-w-[120px]",
                  props.durationLength > 1 ? "text-sm py-.5" : "text-xs py-0",
                ]}
                style={{ color: textColorOnBG() }}
              >
                {props.lesson.content.room}
              </p>
            </Show>
          </div>
        </div>
      </button>
    </div>
  );
};

const FixedHeightDayTimetable: Component<{
  header: ITimetableHeader;
  lessons: IClientLesson[];
  isToday: boolean;
  dayIndex: number;
}> = (props) => {
  const day = () => getDayFromTimetable(props.header, props.dayIndex);
  const windowSize = createWindowSize();
  const lessonHeight = () => (windowSize.height - 48) / TIMETABLE_HOURS.length;

  // Computes start/end indices, column packing, and overlap groups
  const lessonLayouts = createMemo(() => {
    const rawLessons = props.lessons;
    if (!rawLessons || rawLessons.length === 0) return [];

    const processed = rawLessons.map((lesson) => {
      const start_hour = getHourString(new Date(lesson.start_ts));
      const end_hour = getHourString(new Date(lesson.end_ts));
      const start_index = Math.max(
        0,
        TIMETABLE_HOURS.findIndex((h) => h === start_hour),
      );
      let end_index = TIMETABLE_HOURS.findIndex((h) => h === end_hour);
      if (end_index === -1) end_index = start_index + 1;
      if (end_index <= start_index) end_index = start_index + 1;

      return {
        lesson,
        start_index,
        end_index,
        duration: end_index - start_index,
        column: 0,
        totalColumns: 1,
      };
    });

    processed.sort((a, b) => {
      if (a.start_index !== b.start_index) return a.start_index - b.start_index;
      return b.duration - a.duration;
    });

    const columnEnds: number[] = [];
    for (const item of processed) {
      let placed = false;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= item.start_index) {
          item.column = c;
          columnEnds[c] = item.end_index;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.column = columnEnds.length;
        columnEnds.push(item.end_index);
      }
    }

    const n = processed.length;
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = processed[i];
        const b = processed[j];
        if (Math.max(a.start_index, b.start_index) < Math.min(a.end_index, b.end_index)) {
          adj[i].push(j);
          adj[j].push(i);
        }
      }
    }

    const visited = new Array(n).fill(false);
    const result = new Array(n);

    for (let i = 0; i < n; i++) {
      if (!visited[i]) {
        const component: number[] = [];
        const queue = [i];
        visited[i] = true;
        while (queue.length > 0) {
          const curr = queue.shift()!;
          component.push(curr);
          for (const neighbor of adj[curr]) {
            if (!visited[neighbor]) {
              visited[neighbor] = true;
              queue.push(neighbor);
            }
          }
        }

        const maxCol = Math.max(...component.map((idx) => processed[idx].column));
        const totalCols = maxCol + 1;

        for (const idx of component) {
          result[idx] = {
            ...processed[idx],
            totalColumns: totalCols,
          };
        }
      }
    }

    return result;
  });

  return (
    <div class="w-full relative pt-6">
      <div class="absolute top-3 left-0 right-0 z-20">
        <div class="w-fit mx-auto bg-red px-4 py-1 rounded-full">
          <p class="text-sm font-medium" style={{ color: textColorOnBG() }}>
            {getDayString(day())}
          </p>
        </div>
      </div>

      <div class={["h-[calc(100vh-48px)] rounded-lg py-6 mx-2 overflow-hidden relative", props.isToday && "border-2 border-red"]}>
        <Show
          when={!props.lessons.some((l) => l.type === "Férié")}
          fallback={
            <div class="flex flex-col gap-2 items-center justify-center h-full text-center px-4">
              <p class="text-lg font-medium text-red">Jour férié 🎉</p>
              <p class="text-sm text-[rgb(190,190,190)]">Aucun cours aujourd'hui (férié).</p>
            </div>
          }
        >
          <Show
            when={props.lessons.length > 0}
            fallback={
              <div class="flex flex-col gap-2 items-center pt-4">
                <MdiCheck class="text-2xl text-[rgb(240,240,240)]" />
                <p class="text-[rgb(200,200,200)]">Pas de cours !</p>
              </div>
            }
          >
            {/* The relative container perfectly sits within the parent's padding, aligning children to the true grid start */}
            <div class="relative w-full h-full">
              <For each={lessonLayouts()}>
                {(item) => (
                  <FixedHeightDayTimetableLesson
                    lesson={item.lesson}
                    lessonHeight={lessonHeight()}
                    top={item.start_index * lessonHeight()}
                    height={item.duration * lessonHeight()}
                    column={item.column}
                    totalColumns={item.totalColumns}
                    durationLength={item.duration}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default FixedHeightDayTimetable;

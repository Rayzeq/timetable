import { DateTime } from "luxon";
import type { Component, Setter } from "solid-js";
import { createEffect, createMemo, createSignal, For, Match, Show, Switch, untrack } from "solid-js";
import type Swiper from "swiper";
import type { SwiperContainer } from "swiper/element";
// Implement Swiper Element.
// See <https://swiperjs.com/element>.
import { register as registerSwiperElements } from "swiper/element/bundle";
import FixedHeightDayTimetable from "~/components/timetable/fixed-height-day";
import {
  DoneForTodayWidget,
  DoneForWeekWidget,
  getWidgetContent,
  NextLessonWidget,
  OngoingWidget,
  type IDoneForTodayWidget,
  type IDoneForWeekWidget,
  type INextLessonWidget,
  type IOngoingWidget,
} from "~/components/widgets";
import { createMediaQuery } from "~/primitives/media";
import { textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";
import { getGreeting, getSmolDayString } from "~/utils/dates";
import { TIMETABLE_HOURS } from "~/utils/hours";
import { generateICS } from "~/utils/ics";
import { splitLessonsByWeekday } from "~/utils/lessons";
import MdiCalendar from "~icons/mdi/calendar";
import MdiCheck from "~icons/mdi/check";
import MdiChevronLeft from "~icons/mdi/chevron-left";
import MdiChevronRight from "~icons/mdi/chevron-right";
import MdiCog from "~icons/mdi/cog";
import MdiFileDocumentAlertOutline from "~icons/mdi/file-document-alert-outline";
import MdiLoading from "~icons/mdi/loading";

registerSwiperElements();

const SwiperView: Component<{
  // Setter to open the settings modal.
  setSettingsOpen: Setter<boolean>;
  // Timetable of the selected week.
  header?: ITimetableHeader;
  lessons?: IClientLesson[];
  // Timetable of the current week (from today)
  currentWeekLessons?: IClientLesson[];
  currentWeekHeader?: ITimetableHeader;
  // Every lesson of every loaded week, used by the ICS export.
  allLessons?: IClientLesson[];
  // Timetable of the next week (+1 from current week)
  nextWeekLessons?: IClientLesson[];
  nextWeekHeader?: ITimetableHeader;
  // Week number selected, defaults to current week.
  selectedWeekLessons?: IClientLesson[];
  selectedWeekNumber: number;
  setWeekNumber: Setter<number>;
  // Other properties defined in initialization.
  isCurrentlyInVacation: boolean;
  error: string | null;
}> = (props) => {
  /**
   * Media query that tells us whenever
   * the screen is larger or equal to a tablet screen.
   */
  const isTablet = createMediaQuery("(min-width: 768px)");

  // Returns `undefined` when loading.
  const widgetContent = createMemo(() =>
    getWidgetContent({
      currentWeekLessons: props.currentWeekLessons,
      currentWeekHeader: props.currentWeekHeader,
      nextWeekLessons: props.nextWeekLessons,
      nextWeekHeader: props.nextWeekHeader,
    }),
  );

  const vacationRemaining = () =>
    props.header?.start_date ? DateTime.fromISO(props.header.start_date).setLocale("fr").toRelative() : "(calcul en cours...)";

  const goToPreviousWeek = () => {
    // prevent to go into negative weeks
    if (props.selectedWeekNumber === 1) return;

    if (swiperInstanceRef()) {
      // Go to Saturday
      // NOTE: Check previous week and navigate to the last non-empty day.
      swiperInstanceRef()!.swiper.slideTo(5, 0);
    }

    props.setWeekNumber((curr) => curr - 1);
  };

  const goToNextWeek = () => {
    if (swiperInstanceRef()) {
      // go to Monday
      swiperInstanceRef()!.swiper.slideTo(0, 0);
    }

    props.setWeekNumber((curr) => curr + 1);
  };

  let shouldSkipToNextWeek = false;
  let shouldSkipToPreviousWeek = false;

  const [swipeEdgesData, setSwipeEdgesData] = createSignal<{
    where: "left" | "right" | "none";
    progress: number;
  }>({
    where: "none",
    progress: 0,
  });

  const [swiperInstanceRef, setSwiperInstanceRef] = createSignal<SwiperContainer | null>(null);

  createEffect(
    () => swiperInstanceRef(),
    (ref) => {
      if (!ref) return;

      ref.initialize();

      const slideHandler = (evt: Event) => {
        const [{ isEnd, isBeginning }, progress] = (evt as Event & { detail: [instance: Swiper, progress: number] }).detail;

        if (isEnd && progress > 1) {
          setSwipeEdgesData({
            where: "right",
            progress: progress - 1,
          });

          shouldSkipToNextWeek = true;
          shouldSkipToPreviousWeek = false;
        }

        if (isBeginning && progress < 0) {
          setSwipeEdgesData({
            where: "left",
            progress: Math.abs(progress),
          });

          shouldSkipToNextWeek = false;
          shouldSkipToPreviousWeek = true;
        }
      };

      const transitionStartHandler = () => {
        setSwipeEdgesData((prev) => ({ where: prev.where, progress: 0 }));

        if (shouldSkipToNextWeek) {
          shouldSkipToNextWeek = false;
          shouldSkipToPreviousWeek = false;
          setTimeout(() => goToNextWeek(), 150);
        }

        if (shouldSkipToPreviousWeek) {
          shouldSkipToNextWeek = false;
          shouldSkipToPreviousWeek = false;
          setTimeout(() => goToPreviousWeek(), 150);
        }
      };

      const transitionEndHandler = () => {
        setSwipeEdgesData({ where: "none", progress: 0 });
      };

      const edgeHandler = () => {
        if (shouldSkipToPreviousWeek) {
          shouldSkipToPreviousWeek = false;
          setSwipeEdgesData({ where: "none", progress: 0 });
        }

        if (shouldSkipToNextWeek) {
          shouldSkipToNextWeek = false;
          setSwipeEdgesData({ where: "none", progress: 0 });
        }
      };

      ref.addEventListener("swiperprogress", slideHandler);
      ref.addEventListener("swipertransitionstart", transitionStartHandler);
      ref.addEventListener("swipertransitionend", transitionEndHandler);
      ref.addEventListener("swiperfromedge", edgeHandler);
      ref.addEventListener("swipertoedge", edgeHandler);

      return () => {
        ref.removeEventListener("swiperprogress", slideHandler);
        ref.removeEventListener("swipertransitionstart", transitionStartHandler);
        ref.removeEventListener("swipertransitionend", transitionEndHandler);
        ref.removeEventListener("swiperfromedge", edgeHandler);
        ref.removeEventListener("swipertoedge", edgeHandler);
      };
    },
  );

  const timingsOfLessonsInWeek = createMemo(() => {
    if (!props.selectedWeekLessons) return;

    const totalMinutes = props.selectedWeekLessons.reduce(
      (acc, lesson) => acc + (lesson.content.is_cancelled ? 0 : (lesson.end_ts - lesson.start_ts) / 60_000),
      0,
    );

    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    let output = hours + "h";
    if (minutes > 0) {
      output += minutes;
    }

    return output;
  });

  // one pass instead of a per-slide filter re-parsing dates.
  const lessonsByDay = createMemo(() => (props.lessons ? splitLessonsByWeekday(props.lessons) : undefined));

  return (
    <>
      <header class="relative z-20 p-4 pb-2 bg-red flex justify-between items-center" style={{ color: textColorOnBG() }}>
        <div class="flex flex-col">
          <p class="text-base sm:text-xl font-medium">{getGreeting()}</p>
        </div>
        <div class="flex gap-2">
          <Show when={props.allLessons && props.allLessons.length > 0}>
            <button
              type="button"
              class="flex items-center justify-center p-2"
              title="Exporter tout l'emploi du temps au format ICS"
              aria-label="Exporter tout l'emploi du temps au format ICS"
              onClick={() => generateICS(props.allLessons!)}
            >
              <MdiCalendar class="text-lg" />
            </button>
          </Show>
          <button type="button" class="flex items-center justify-center p-2" onClick={() => props.setSettingsOpen(true)}>
            <MdiCog class="text-lg" />
          </button>
        </div>
      </header>

      {/* Next lesson widget at the top. */}
      <div class="tablet:relative top-0 z-50 relative">
        {/* Color span under the widget. */}
        <span class="absolute top-0 bg-red z-40 h-[32px] w-full" />

        <div class="relative z-50 pt-2 mx-4">
          <div class="flex justify-between gap-4">
            {/** Actual widget's code. */}
            <div class="bg-[rgb(27,27,27)] rounded-lg h-full shadow-xl mx-auto w-full tablet:(mx-0 max-w-[450px])">
              <Show
                when={!props.isCurrentlyInVacation}
                fallback={
                  <div class="flex flex-col justify-center py-4 px-8 h-full gap-1">
                    <div class="flex gap-2 items-center">
                      <MdiCheck class="text-red text-lg" />
                      <p class="text-[rgb(240,240,240)]">Vous êtes actuellement en vacances !</p>
                    </div>
                    <div class="flex gap-2 items-center">
                      <MdiCalendar class="text-red text-lg" />
                      <p class="text-[rgb(240,240,240)]">Vous reprenez {vacationRemaining()}</p>
                    </div>
                  </div>
                }
              >
                <Show
                  when={widgetContent()}
                  fallback={
                    <div class="flex justify-center items-center py-4 px-8 h-full">
                      <p class="text-[rgb(240,240,240)] animate-pulse">Chargement du contenu...</p>
                    </div>
                  }
                >
                  {(top) => (
                    <Switch>
                      <Match when={top().type === "DONE_FOR_TODAY"}>
                        <DoneForTodayWidget {...(top() as IDoneForTodayWidget)} />
                      </Match>
                      <Match when={top().type === "DONE_FOR_WEEK"}>
                        <DoneForWeekWidget {...(top() as IDoneForWeekWidget)} />
                      </Match>
                      <Match when={top().type === "NEXT_LESSON"}>
                        <NextLessonWidget {...(top() as INextLessonWidget)} />
                      </Match>
                      <Match when={top().type === "ONGOING"}>
                        <OngoingWidget {...(top() as IOngoingWidget)} />
                      </Match>
                    </Switch>
                  )}
                </Show>
              </Show>
            </div>

            {/** Week selector on ">= tablet" screens. */}
            <Show when={isTablet()}>
              <div class="bg-[rgb(27,27,27)] rounded-lg h-full shadow-xl">
                <div class="flex flex-col items-center justify-center gap-2 px-4 py-4 laptop-sm:(flex-row justify-between gap-6 px-8) h-full">
                  <div class="flex flex-col flex-shrink-0">
                    <p class="text-lg text-[rgb(240,240,240)]">
                      {props.selectedWeekNumber === -1 ? "Récupération..." : `Semaine ${props.selectedWeekNumber}`}
                      <Show when={timingsOfLessonsInWeek()}>
                        {(timings) => <span class="ml-8px text-sm text-[rgb(150,150,150)]">{timings()}</span>}
                      </Show>
                    </p>
                    <p class="text-sm text-[rgb(190,190,190)]">
                      {props.header
                        ? `Du ${getSmolDayString(new Date(props.header.start_date))} au ${getSmolDayString(new Date(props.header.end_date))}`
                        : props.error
                          ? "Oups, y a un problème..."
                          : "En attente de l'EDT..."}
                    </p>
                  </div>
                  <div class="flex gap-3 items-center w-full text-[rgb(240,240,240)]">
                    <button
                      type="button"
                      class="p-1 bg-red/20 hover:bg-red active:bg-red/60 border border-red rounded-full laptop-sm:(w-auto p-1.5) w-full flex justify-center items-center"
                      onClick={() => goToPreviousWeek()}
                    >
                      <MdiChevronLeft class="text-lg" />
                    </button>
                    <button
                      type="button"
                      class="p-1 bg-red/20 hover:bg-red active:bg-red/60 border border-red rounded-full laptop-sm:(w-auto p-1.5) w-full flex justify-center items-center"
                      onClick={() => goToNextWeek()}
                    >
                      <MdiChevronRight class="text-lg" />
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>

      <main class="pt-6 pb-3">
        <Show when={!isTablet()}>
          <div class="flex items-center justify-between gap-2 mb-6 px-4">
            <div class="flex flex-col flex-shrink-0">
              <p class="text-lg text-[rgb(240,240,240)]">
                {props.selectedWeekNumber === -1 ? "Récupération..." : `Semaine ${props.selectedWeekNumber}`}
                <Show when={timingsOfLessonsInWeek()}>{(timings) => <span class="ml-8px text-sm text-[rgb(150,150,150)]">{timings()}</span>}</Show>
              </p>
              <p class="text-xs text-[rgb(190,190,190)]">
                {props.header
                  ? `Du ${getSmolDayString(new Date(props.header.start_date))} au ${getSmolDayString(new Date(props.header.end_date))}`
                  : props.error
                    ? "Oups, y a un problème..."
                    : "En attente de l'EDT..."}
              </p>
            </div>
            <div class="flex gap-3 items-center flex-shrink-0">
              <button
                type="button"
                class="p-1.5 bg-red/20 hover:bg-red active:bg-red/60 transition border border-red rounded-full"
                onClick={() => goToPreviousWeek()}
              >
                <MdiChevronLeft class="text-lg text-[rgb(240,240,240)]" />
              </button>
              <button
                type="button"
                class="p-1.5 bg-red/20 hover:bg-red active:bg-red/60 transition border border-red rounded-full"
                onClick={() => goToNextWeek()}
              >
                <MdiChevronRight class="text-lg text-[rgb(240,240,240)]" />
              </button>
            </div>
          </div>
        </Show>

        <Show
          when={props.header && props.lessons && props.lessons.length > 0}
          fallback={
            <Show
              when={props.error}
              fallback={
                // Loading screen.
                <div class="flex flex-col gap-4 items-center pt-10 text-[rgb(200,200,200)]">
                  <MdiLoading class="animate-spin text-4xl" />
                  <p class="animate-pulse">Chargement...</p>
                </div>
              }
            >
              {(error) => (
                // Error screen.
                <div class="flex flex-col px-6 items-center gap-6 pt-10">
                  <MdiFileDocumentAlertOutline class="text-4xl text-red" />
                  <p class="text-center text-[rgb(235,235,235)]">
                    <span class="text-red font-medium">Erreur: </span>
                    {error()}
                  </p>
                </div>
              )}
            </Show>
          }
        >
          <div class="relative overflow-hidden pb-3">
            <Show when={swipeEdgesData().where === "left"}>
              <div
                class={[
                  "fixed inset-y-0 right-0 -left-6 bg-gradient-to-r from-red to-transparent pointer-events-none",
                  { "transition-opacity": swipeEdgesData().progress === 0 },
                ]}
                style={{
                  opacity: swipeEdgesData().progress * 1.5,
                }}
              />
            </Show>

            <Show when={swipeEdgesData().where === "right"}>
              <div
                class={[
                  "fixed inset-y-0 left-0 -right-6 bg-gradient-to-l from-red to-transparent pointer-events-none",
                  { "transition-opacity": swipeEdgesData().progress === 0 },
                ]}
                style={{
                  opacity: swipeEdgesData().progress * 1.5,
                }}
              />
            </Show>

            {/* CSS-positioned hour lines */}
            <div class="absolute top-12 bottom-3 left-0 right-0 pointer-events-none">
              <For each={TIMETABLE_HOURS}>
                {(hour, hour_index) => (
                  <div
                    class="absolute w-full flex items-center gap-2 -translate-y-1/2"
                    style={{
                      top: `${(hour_index() / (TIMETABLE_HOURS.length - 1)) * 100}%`,
                    }}
                  >
                    <p
                      class={[
                        "text-sm text-right pl-4 leading-none w-[50px] shrink-0",
                        hour_index() % 2 === 0 ? "text-[rgb(200,200,200)]" : "text-[rgb(140,140,140)] opacity-20",
                      ]}
                    >
                      {hour}
                    </p>

                    <div
                      class={["h-[1px] w-full mr-2 tablet:mr-6 opacity-20", hour_index() % 2 === 0 ? "bg-[rgb(80,80,80)]" : "bg-[rgb(50,50,50)]"]}
                    />
                  </div>
                )}
              </For>
            </div>

            <swiper-container
              ref={setSwiperInstanceRef}
              class="mx-0 tablet:(ml-16 mr-6) ml-16"
              grab-cursor={true}
              initial-slide={untrack(() => now().weekday - 1)}
              slides-per-view={1}
              focusable-elements=".focusable-lesson-for-swiper"
              prop:breakpoints={{
                1660: { slidesPerView: 6 },
                1550: { slidesPerView: 5 },
                1296: { slidesPerView: 4 },
                1092: { slidesPerView: 3 },
                768: { slidesPerView: 2 },
              }}
            >
              <For each={lessonsByDay()}>
                {(lessons, dayIndex) => (
                  <swiper-slide>
                    <FixedHeightDayTimetable
                      header={props.header!}
                      lessons={lessons}
                      isToday={dayIndex() === now().weekday - 1 && props.currentWeekHeader?.week_number === props.selectedWeekNumber}
                      dayIndex={dayIndex()}
                    />
                  </swiper-slide>
                )}
              </For>
            </swiper-container>
          </div>
        </Show>
      </main>
    </>
  );
};

export default SwiperView;

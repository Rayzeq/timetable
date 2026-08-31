import { Show, Match, Switch, For, Repeat, createSignal, createEffect, createMemo, untrack } from "solid-js";
import type { Component, Setter } from "solid-js";
import type { ITimetableHeader } from "~/types/api";
import type { IClientLesson } from "~/types/client";
import { createMediaQuery } from "~/primitives/media";
import { createWindowSize } from "~/primitives/window-size";
import { DateTime } from "luxon";

import MdiFileDocumentAlertOutline from "~icons/mdi/file-document-alert-outline";
import MdiChevronRight from "~icons/mdi/chevron-right";
import MdiChevronLeft from "~icons/mdi/chevron-left";
import MdiFilePdfBox from "~icons/mdi/file-pdf-box";
import MdiCalendar from "~icons/mdi/calendar";
import MdiLoading from "~icons/mdi/loading";
import MdiHeart from "~icons/mdi/heart";
import MdiCheck from "~icons/mdi/check";
import MdiCog from "~icons/mdi/cog";
import MdiTableEye from "~icons/mdi/table-eye";

import MobileDayTimetable from "~/components/timetable/relative-day";
import FixedHeightDayTimetable from "~/components/timetable/fixed-height-day";

import {
  getWidgetContent,
  DoneForTodayWidget,
  type IDoneForTodayWidget,
  DoneForWeekWidget,
  type IDoneForWeekWidget,
  NextLessonWidget,
  type INextLessonWidget,
  OngoingWidget,
  type IOngoingWidget
} from "~/components/widgets";

import { preferences, getUserYear, getUserCustomizationKey, textColorOnBG } from "~/stores/preferences";
import { now } from "~/stores/temporary";

import { getGreeting, getSmolDayString } from "~/utils/dates";
import { generateICS } from "~/utils/ics";
import { splitLessonsByWeekday } from "~/utils/lessons";
import { TIMETABLE_HOURS } from "~/utils/hours";

// Implement Swiper Element.
// See <https://swiperjs.com/element>.
import { register as registerSwiperElements } from "swiper/element/bundle";
import type { SwiperContainer } from "swiper/element";
import type Swiper from "swiper";
registerSwiperElements();

const SwiperView: Component<{
  // Setter to open the settings modal.
  setSettingsOpen: Setter<boolean>
  // Timetable of the selected week.
  header?: ITimetableHeader;
  lessons?: IClientLesson[];
  // Timetable of the current week (from today)
  currentWeekLessons?: IClientLesson[];
  currentWeekHeader?: ITimetableHeader;
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

  // Needed for fixed height timetable feature.
  const shouldUseFixedHeightDays = () => getUserCustomizationKey("use_fixed_height");
  const windowSize = createWindowSize();

  // Only used for slide container - one-time snapshot on purpose.
  const [activeDayIndex, setActiveDayIndex] = createSignal(untrack(() => now().weekday - 1));

  // Returns `undefined` when loading.
  const widgetContent = createMemo(() => getWidgetContent({
    currentWeekLessons: props.currentWeekLessons,
    nextWeekLessons: props.nextWeekLessons,
    nextWeekHeader: props.nextWeekHeader
  }));

  const vacationRemaining = () => props.header?.start_date
    ? DateTime.fromISO(props.header.start_date).setLocale("fr").toRelative()
    : "(calcul en cours...)";

  const [pdfMenuOpen, setPdfMenuOpen] = createSignal(false);
  let pdfMenuRef: HTMLDivElement | undefined;

  // the official pdfs exist at three levels of detail.
  const pdfMenuEntries = () => {
    if (!props.header) return [];

    const year = `A${getUserYear()}`;
    const group = `G${preferences.main_group}`;
    // the upstream directories are lowercase - only the display name is not.
    const subgroup = `${group}${preferences.sub_group === 0 ? "a" : "b"}`;
    const base = `https://edt-iut-info.unilim.fr/edt/${year}`;
    const week = `S${props.header.week_number}`;

    return [
      { label: "EDT de la promo", name: year, url: `${base}/${year}_${week}.pdf` },
      { label: "EDT du groupe", name: group, url: `${base}/${group}/${group}_${week}.pdf` },
      { label: "EDT du sous-groupe", name: subgroup.toUpperCase(), url: `${base}/${subgroup}/${subgroup}_${week}.pdf` }
    ];
  };

  createEffect(() => pdfMenuOpen(), (open) => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !pdfMenuRef?.contains(event.target)) {
        setPdfMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPdfMenuOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });

  const goToPreviousWeek = () => {
    // prevent to go into negative weeks
    if (props.selectedWeekNumber === 1) return;

    if (swiperInstanceRef()) {
      // Go to Saturday
      // NOTE: Check previous week and navigate to the last non-empty day.
      swiperInstanceRef()!.swiper.slideTo(5, 0);
    }

    setActiveDayIndex(5);
    props.setWeekNumber(curr => curr - 1);
  };

  const goToNextWeek = () => {
    if (swiperInstanceRef()) {
      // go to Monday
      swiperInstanceRef()!.swiper.slideTo(0, 0);
    }

    setActiveDayIndex(0);
    props.setWeekNumber(curr => curr + 1);
  };

  let shouldSkipToNextWeek = false;
  let shouldSkipToPreviousWeek = false;

  const [swipeEdgesData, setSwipeEdgesData] = createSignal<{
    where: "left" | "right" | "none";
    progress: number;
  }>({
    where: "none",
    progress: 0
  });

  const [swiperInstanceRef, setSwiperInstanceRef] = createSignal<SwiperContainer | null>(null);

  createEffect(() => swiperInstanceRef(), (ref) => {
    if (!ref) return;

    const slideHandler = (evt: Event) => {
      const [{ isEnd, isBeginning }, progress] = (evt as Event & { detail: [instance: Swiper, progress: number]; }).detail;

      if (isEnd && progress > 1) {
        setSwipeEdgesData({
          where: "right",
          progress: progress - 1
        });

        shouldSkipToNextWeek = true;
        shouldSkipToPreviousWeek = false;
      }

      if (isBeginning && progress < 0) {
        setSwipeEdgesData({
          where: "left",
          progress: Math.abs(progress)
        });

        shouldSkipToNextWeek = false;
        shouldSkipToPreviousWeek = true;
      }
    };

    const transitionStartHandler = () => {
      setSwipeEdgesData(prev => ({ where: prev.where, progress: 0 }));

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
  });

  const timingsOfLessonsInWeek = createMemo(() => {
    if (!props.selectedWeekLessons) return;

    const totalMinutes = props.selectedWeekLessons.reduce(
      (acc, lesson) => acc + (lesson.end_ts - lesson.start_ts) / 60_000, 0
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
  const lessonsByDay = createMemo(() => props.lessons ? splitLessonsByWeekday(props.lessons) : undefined);

  return (
    <>
      {/* raised above the sticky widget while the pdf menu is open. */}
      <header class={["relative p-4 pb-2 bg-red flex justify-between items-center", pdfMenuOpen() ? "z-60" : "z-20"]}
        style={{ color: textColorOnBG() }}
      >
        <div class="flex flex-col">
          <p class="text-base sm:text-xl font-medium">
            {getGreeting()}
          </p>
          <p class="text-xs sm:text-sm opacity-80">
            Vous êtes en G{preferences.main_group}{preferences.sub_group === 0 ? "A" : "B"}.
          </p>
        </div>
        <div class="flex gap-2">
          <a href="/rooms" class="flex items-center justify-center p-2">
            <MdiTableEye class="text-lg" />
          </a>

          <Show when={props.header && typeof props.lessons !== "undefined"}>
            <div class="relative" ref={pdfMenuRef}>
              <button type="button"
                class="flex items-center justify-center p-2"
                aria-label="Télécharger l'EDT en PDF"
                aria-haspopup="menu"
                aria-expanded={pdfMenuOpen() ? "true" : "false"}
                onClick={() => setPdfMenuOpen(open => !open)}
              >
                <MdiFilePdfBox class="text-lg" />
              </button>

              <Show when={pdfMenuOpen()}>
                <div role="menu" class="animate-scale-in animate-duration-150 absolute right-0 top-full mt-1 z-50 w-60 py-1 bg-[rgb(32,32,32)] rounded-lg shadow-xl text-[rgb(220,220,220)]">
                  <For each={pdfMenuEntries()}>
                    {(entry) => (
                      <a role="menuitem" href={entry.url} target="_blank" rel="noopener"
                        class="flex items-center justify-between gap-4 px-4 py-2 text-sm hover:bg-[rgb(42,42,42)]"
                        onClick={() => setPdfMenuOpen(false)}
                      >
                        {entry.label}
                        <span class="text-red font-medium">{entry.name}</span>
                      </a>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
          <Show when={props.header && typeof props.lessons !== "undefined"}>
            <button type="button"
              class="flex items-center justify-center p-2"
              onClick={() => generateICS({
                header: props.header!,
                lessons: props.lessons!
              })}
            >
              <MdiCalendar class="text-lg" />
            </button>
          </Show>
          <button type="button"
            class="flex items-center justify-center p-2"
            onClick={() => props.setSettingsOpen(true)}
          >
            <MdiCog class="text-lg" />
          </button>
        </div>
      </header>

      {/* Next lesson widget at the top. */}
      <div class={["tablet:relative top-0 z-50", shouldUseFixedHeightDays() ? "relative" : "sticky"]}>
        {/* Color span under the widget. */}
        <span class="absolute top-0 bg-red z-40 h-[32px] w-full" />

        <div class="relative z-50 pt-2 mx-4">
          <div class="flex justify-between gap-4">

            {/** Actual widget's code. */}
            <div class="bg-[rgb(27,27,27)] rounded-lg h-full shadow-xl mx-auto w-full tablet:(mx-0 max-w-[450px])">
              <Show when={!props.isCurrentlyInVacation}
                fallback={
                  <div class="flex flex-col justify-center py-4 px-8 h-full gap-1">
                    <div class="flex gap-2 items-center">
                      <MdiCheck class="text-red text-lg" />
                      <p class="text-[rgb(240,240,240)]">
                        Vous êtes actuellement en vacances !
                      </p>
                    </div>
                    <div class="flex gap-2 items-center">
                      <MdiCalendar class="text-red text-lg" />
                      <p class="text-[rgb(240,240,240)]">
                        Vous reprenez {vacationRemaining()}
                      </p>
                    </div>
                  </div>
                }
              >
                <Show when={widgetContent()} fallback={
                  <div class="flex justify-center items-center py-4 px-8 h-full">
                    <p class="text-[rgb(240,240,240)] animate-pulse">
                      Chargement du contenu...
                    </p>
                  </div>
                }>
                  {top => (
                    <Switch>
                      <Match when={top().type === "DONE_FOR_TODAY"}>
                        <DoneForTodayWidget {...top() as IDoneForTodayWidget} />
                      </Match>
                      <Match when={top().type === "DONE_FOR_WEEK"}>
                        <DoneForWeekWidget {...top() as IDoneForWeekWidget} />
                      </Match>
                      <Match when={top().type === "NEXT_LESSON"}>
                        <NextLessonWidget {...top() as INextLessonWidget} />
                      </Match>
                      <Match when={top().type === "ONGOING"}>
                        <OngoingWidget {...top() as IOngoingWidget} />
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
                        {timings => (
                          <span class="ml-8px text-sm text-[rgb(150,150,150)]">
                            {timings()}
                          </span>
                        )}
                      </Show>
                    </p>
                    <p class="text-sm text-[rgb(190,190,190)]">
                      {props.header ? (
                        `Du ${getSmolDayString(new Date(props.header.start_date))} au ${getSmolDayString(new Date(props.header.end_date))}`
                      ) : (props.error ? "Oups, y a un problème..." : "En attente de l'EDT...")}
                    </p>
                  </div>
                  <div class="flex gap-3 items-center w-full text-[rgb(240,240,240)]">
                    <button type="button" class="p-1 bg-red/20 hover:bg-red active:bg-red/60 border border-red rounded-full laptop-sm:(w-auto p-1.5) w-full flex justify-center items-center"
                      onClick={() => goToPreviousWeek()}
                    >
                      <MdiChevronLeft class="text-lg" />
                    </button>
                    <button type="button" class="p-1 bg-red/20 hover:bg-red active:bg-red/60 border border-red rounded-full laptop-sm:(w-auto p-1.5) w-full flex justify-center items-center"
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

      <main class="pt-6">
        <Show when={!isTablet()}>
          <div class="flex items-center justify-between gap-2 mb-6 px-4">
            <div class="flex flex-col flex-shrink-0">
              <p class="text-lg text-[rgb(240,240,240)]">
                {props.selectedWeekNumber === -1 ? "Récupération..." : `Semaine ${props.selectedWeekNumber}`}
                <Show when={timingsOfLessonsInWeek()}>
                  {timings => (
                    <span class="ml-8px text-sm text-[rgb(150,150,150)]">
                      {timings()}
                    </span>
                  )}
                </Show>
              </p>
              <p class="text-xs text-[rgb(190,190,190)]">
                {props.header ? (
                  `Du ${getSmolDayString(new Date(props.header.start_date))} au ${getSmolDayString(new Date(props.header.end_date))}`
                ) : (props.error ? "Oups, y a un problème..." : "En attente de l'EDT...")}
              </p>
            </div>
            <div class="flex gap-3 items-center flex-shrink-0">
              <button type="button" class="p-1.5 bg-red/20 hover:bg-red active:bg-red/60 transition border border-red rounded-full"
                onClick={() => goToPreviousWeek()}
              >
                <MdiChevronLeft class="text-lg text-[rgb(240,240,240)]" />
              </button>
              <button type="button" class="p-1.5 bg-red/20 hover:bg-red active:bg-red/60 transition border border-red rounded-full"
                onClick={() => goToNextWeek()}
              >
                <MdiChevronRight class="text-lg text-[rgb(240,240,240)]" />
              </button>
            </div>
          </div>
        </Show>

        <Show when={props.header && props.lessons && props.lessons.length > 0}
          fallback={
            <Show when={props.error}
              fallback={
                // Loading screen.
                <div class="flex flex-col gap-4 items-center pt-10 text-[rgb(200,200,200)]">
                  <MdiLoading class="animate-spin text-4xl" />
                  <p class="animate-pulse">
                    Chargement...
                  </p>
                </div>
              }
            >
              {error => (
                // Error screen.
                <div class="flex flex-col px-6 items-center gap-6 pt-10">
                  <MdiFileDocumentAlertOutline class="text-4xl text-red" />
                  <p class="text-center text-[rgb(235,235,235)]">
                    <span class="text-red font-medium">Erreur: </span>{error()}
                  </p>
                </div>
              )}
            </Show>
          }
        >
          <div class="relative overflow-hidden pb-3">
            <Show when={swipeEdgesData().where === "left"}>
              <div class={["fixed inset-y-0 right-0 -left-6 bg-gradient-to-r from-red to-transparent pointer-events-none", { "transition-opacity": swipeEdgesData().progress === 0 }]}
                style={{
                  opacity: swipeEdgesData().progress * 1.5
                }}
              />
            </Show>

            <Show when={swipeEdgesData().where === "right"}>
              <div class={["fixed inset-y-0 left-0 -right-6 bg-gradient-to-l from-red to-transparent pointer-events-none", { "transition-opacity": swipeEdgesData().progress === 0 }]}
                style={{
                  opacity: swipeEdgesData().progress * 1.5
                }}
              />
            </Show>

            <Show when={shouldUseFixedHeightDays()}>
              <div class="absolute top-12 left-0 right-0 pointer-events-none">
                <For each={TIMETABLE_HOURS}>
                  {(hour, hour_index) => (
                    <div class="absolute w-full flex items-center gap-2"
                      style={{
                        top: (hour_index() * ((windowSize.height - 48) / TIMETABLE_HOURS.length)) + "px"
                      }}
                    >
                      <p class={["text-sm text-right pl-4 leading-0 w-[50px] shrink-0", hour_index() % 2 === 0
                        ? "text-[rgb(200,200,200)]"
                        : "text-[rgb(140,140,140)] opacity-20"]}
                      >
                        {hour}
                      </p>

                      <div class={["h-[1px] w-full mr-2 tablet:mr-6 opacity-20", hour_index() % 2 === 0
                        ? "bg-[rgb(80,80,80)]"
                        : "bg-[rgb(50,50,50)]"]}
                      />
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <swiper-container ref={setSwiperInstanceRef}
              class={"mx-0 tablet:(ml-16 mr-6)" + (shouldUseFixedHeightDays() ? " ml-16" : "")}
              grab-cursor={true}
              initial-slide={activeDayIndex()}
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
              <Repeat count={7}>
                {(index) => (
                  <swiper-slide>
                    <Show when={!shouldUseFixedHeightDays()}
                      fallback={
                        <FixedHeightDayTimetable
                          dayIndex={index}
                          isToday={index === (now().weekday - 1) && props.currentWeekHeader?.week_number === props.selectedWeekNumber}
                          header={props.header!}
                          lessons={lessonsByDay()![index]}
                        />
                      }
                    >
                      <MobileDayTimetable
                        header={props.header!}
                        dayIndex={index}
                        isToday={index === (now().weekday - 1) && props.currentWeekHeader?.week_number === props.selectedWeekNumber}
                        lessons={lessonsByDay()![index]}
                      />
                    </Show>
                  </swiper-slide>
                )}
              </Repeat>
            </swiper-container>
          </div>
        </Show>
      </main>

      <footer class="w-full text-center pb-8 pt-6 text-[rgb(220,220,220)]">
        <p class="text-sm flex gap-1 justify-center items-center">
          Réalisé avec <MdiHeart class="text-red" /> par <a class="font-medium hover:underline text-red" href="https://github.com/Vexcited">Mikkel</a>
        </p>

        <a href="https://code.vexcited.com/unilim/timetable" class="text-xs pt-1 text-red/80 hover:(underline text-red)">
          SHA:{__APP_COMMIT_SHA__}
        </a>
      </footer>
    </>
  );
};

export default SwiperView;

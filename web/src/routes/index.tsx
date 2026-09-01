import { createSignal, createEffect, createMemo, onSettled, untrack } from "solid-js";
import type { Component } from "solid-js";
import type { IClientTimetable } from "~/types/client";

import { SettingsModal } from "~/components/modals/Settings";
import SwiperView from "~/components/views/Swiper";

import { APIError, APIErrorType } from "~/utils/errors";
import { lessonsForSubGroup } from "~/utils/lessons";

import { getDayWeekNumber, refreshTimetableForWeekNumber, getLatestWeekNumber, getTemporaryTimetablesStore } from "~/stores/timetables";
import { preferences, getUserYear } from "~/stores/preferences";
import { now } from "~/stores/temporary";

const [settingsOpen, setSettingsOpen] = createSignal(false);

const Page: Component = () => {
  // Signals for week numbers. We use `-1` as a default value, that should be handled as a loading state.
  // Whenever an error is thrown we keep the `-1` value and set the `error()` signal.
  const [currentWeekNumber, setCurrentWeekNumber] = createSignal(-1);
  const [selectedWeekNumber, setSelectedWeekNumber] = createSignal(-1);

  const [isCurrentlyInVacation, setCurrentlyInVacation] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const currentWeekTimetable = createMemo(() => getTemporaryTimetablesStore(getUserYear(), currentWeekNumber()));
  const selectedWeekTimetable = createMemo(() => getTemporaryTimetablesStore(getUserYear(), selectedWeekNumber()));
  // We'll get the timetable for the current next week so we can peek if needed.
  const nextWeekTimetable = createMemo(() => getTemporaryTimetablesStore(getUserYear(), currentWeekNumber() + 1));

  /**
   * Handles the current week number signal, and
   * also handles vacation weeks.
   *
   * @returns - Current week number or `-1` whenever an error has been thrown.
   * In that case, an error overlay should be displayed in the UI using the `error()` signal.
   */
  const refreshCurrentWeekNumber = async (): Promise<number> => {
    // one-time snapshots on purpose - this runs imperatively.
    const year = untrack(getUserYear);
    const today = untrack(now);

    try {
      // Reset the vacation state.
      setCurrentlyInVacation(false);

      // We get the current week number using timetables meta.
      const currentWeekNumber = await getDayWeekNumber(today, year);

      // We don't await the refresh.
      refreshTimetableForWeekNumber(year, currentWeekNumber).catch(() => { /* surfaced by the awaited refresh */ });
      refreshTimetableForWeekNumber(year, currentWeekNumber + 1).catch(() => { /* next week may not be published yet */ });

      // We set the current week number signal.
      setCurrentWeekNumber(currentWeekNumber);
      return currentWeekNumber;
    }
    catch (error) {
      if (error instanceof APIError) {
        // Whenever we don't find the current week in the timetables meta,
        // it means that we're in vacation.
        // When that's the case, we'll display the latest week as the current.
        if (error.type === APIErrorType.NOT_FOUND) {
          const currentWeekNumber = await getLatestWeekNumber(year);

          // We don't await the refresh.
          refreshTimetableForWeekNumber(year, currentWeekNumber).catch(() => { /* stays on cache */ });
          refreshTimetableForWeekNumber(year, currentWeekNumber + 1).catch(() => { /* next week may not be published yet */ });

          setCurrentlyInVacation(true);
          setCurrentWeekNumber(currentWeekNumber);
          return currentWeekNumber;
        }

        // Otherwise we don't have any cache so let's just let it die.
        setCurrentWeekNumber(-1);
        setError(error.message);
        return -1;
      }

      setCurrentWeekNumber(-1);
      console.error("unhandled:", error);
      setError("Erreur inconnue(2): voir la console.");
      return -1;
    }
  };

  const refreshSelectedTimetable = async (): Promise<void> => {
    try {
      setError(null);
      await refreshTimetableForWeekNumber(untrack(getUserYear), untrack(selectedWeekNumber));
    }
    catch (error) {
      if (error instanceof APIError) {
        setError(error.message);
      }
      else {
        console.error("unhandled:", error);
        setError("Erreur inconnue(1): voir la console.");
      }
    }
  };

  // Let's refresh the current week number on page load
  // and select the current week by default.
  onSettled(() => {
    (async () => {
      const currentWeekNumber = await refreshCurrentWeekNumber();

      // We select current week on page load, by default.
      setSelectedWeekNumber(currentWeekNumber);
    })();
  });

  // Refresh the selected timetable whenever the selected week number changes.
  createEffect(() => selectedWeekNumber(), (selectedWeekNumber, previous) => {
    if (selectedWeekNumber < 1 || selectedWeekNumber === previous) return;
    refreshSelectedTimetable();
  });

  /**
   * Handle whenever the current week number changes
   * while we are in the app.
   *
   * Example: The app is opened Sunday at 23:59, and
   * the week changes to the next one. We'll update
   * the current week number.
   */
  createEffect(() => now().weekNumber, (weekNumber, previousWeekNumber) => {
    if (previousWeekNumber === undefined || weekNumber === previousWeekNumber) return;
    refreshCurrentWeekNumber();
  });

  // Refresh all the timetables whenever the year changes.
  createEffect(() => getUserYear(), (year, previousYear) => {
    if (previousYear === undefined || year === previousYear) return;
    refreshCurrentWeekNumber();
    refreshSelectedTimetable();
  });

  /**
   * Helper function that returns timetable lessons
   * for the current sub-group chosen in the preferences.
   */
  const lessonsForUser = (timetable: IClientTimetable | null) => timetable ? lessonsForSubGroup(timetable, {
    main_group: preferences.main_group,
    sub_group: preferences.sub_group
  }) : undefined;

  // We'll create memoized signals for the current week, selected week and next week.
  // Only the lessons from the user's main group and sub-group will be returned.
  const currentWeekTimetableLessons = createMemo(() => lessonsForUser(currentWeekTimetable()));
  const selectedTimetableLessons = createMemo(() => lessonsForUser(selectedWeekTimetable()));
  const nextWeekTimetableLessons = createMemo(() => lessonsForUser(nextWeekTimetable()));

  return (
    <>
      <SettingsModal open={settingsOpen()} setOpen={setSettingsOpen} />

      <SwiperView
        setSettingsOpen={setSettingsOpen}
        header={selectedWeekTimetable()?.header}
        lessons={selectedTimetableLessons()}
        currentWeekLessons={currentWeekTimetableLessons()}
        currentWeekHeader={currentWeekTimetable()?.header}
        nextWeekLessons={nextWeekTimetableLessons()}
        nextWeekHeader={nextWeekTimetable()?.header}
        selectedWeekLessons={selectedTimetableLessons()}
        selectedWeekNumber={selectedWeekNumber()}
        setWeekNumber={setSelectedWeekNumber}
        isCurrentlyInVacation={isCurrentlyInVacation()}
        error={error()}
      />
    </>
  );
};

export default Page;

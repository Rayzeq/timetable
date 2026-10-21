import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, onSettled, untrack } from "solid-js";

import { SettingsModal } from "~/components/modals/Settings";
import SwiperView from "~/components/views/Swiper";
import { preferences } from "~/stores/preferences";
import { now } from "~/stores/temporary";
import {
  fetchAndProcessTimetable,
  getDayWeekNumber,
  getNextWeekTimetable,
  getTemporaryTimetablesStore,
  refreshTimetable,
  timetablesStore,
} from "~/stores/timetables";
import { APIError, APIErrorType } from "~/utils/errors";

const [settingsOpen, setSettingsOpen] = createSignal(false);

const Page: Component = () => {
  const [currentWeekNumber, setCurrentWeekNumber] = createSignal(-1);
  const [selectedWeekNumber, setSelectedWeekNumber] = createSignal(-1);

  const [isCurrentlyInVacation, setCurrentlyInVacation] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const currentWeekTimetable = createMemo(() => getTemporaryTimetablesStore(currentWeekNumber()));
  const selectedWeekTimetable = createMemo(() => getTemporaryTimetablesStore(selectedWeekNumber()));
  const nextWeekTimetable = createMemo(() => getNextWeekTimetable(currentWeekNumber()));

  const refreshCurrentWeekNumber = async (): Promise<number> => {
    const today = untrack(now);

    try {
      setCurrentlyInVacation(false);
      await fetchAndProcessTimetable();
      setError(null);

      const currentWeekNumber = await getDayWeekNumber(today);
      setCurrentWeekNumber(currentWeekNumber);
      return currentWeekNumber;
    } catch (error) {
      if (error instanceof APIError) {
        if (error.type === APIErrorType.NOT_FOUND) {
          try {
            const meta = timetablesStore.meta;
            const todayMillis = today.toMillis();
            const futureMeta = meta.find((m) => new Date(m.start_date).getTime() >= todayMillis);
            const targetMeta = futureMeta ?? meta[meta.length - 1];

            setCurrentlyInVacation(true);
            const weekNum = targetMeta ? targetMeta.week_number : today.weekNumber;
            setCurrentWeekNumber(weekNum);
            return weekNum;
          } catch {
            // fallback
          }
        }
        setCurrentWeekNumber(-1);
        setError(error.message);
        return -1;
      }

      setCurrentWeekNumber(-1);
      console.error("unhandled:", error);
      setError("Erreur inconnue: voir la console.");
      return -1;
    }
  };

  const refreshSelectedTimetable = async (): Promise<void> => {
    try {
      setError(null);
      await refreshTimetable();
    } catch (error) {
      if (error instanceof APIError) {
        setError(error.message);
      } else {
        console.error("unhandled:", error);
        setError("Erreur inconnue.");
      }
    }
  };

  onSettled(() => {
    (async () => {
      const currentWeekNumber = await refreshCurrentWeekNumber();
      setSelectedWeekNumber(currentWeekNumber > 0 ? currentWeekNumber : 1);
    })();
  });

  createEffect(
    () => selectedWeekNumber(),
    (selectedWeekNumber, previous) => {
      if (selectedWeekNumber < 1 || selectedWeekNumber === previous) return;
      refreshSelectedTimetable();
    },
  );

  createEffect(
    () => [preferences.username, preferences.password] as const,
    () => {
      (async () => {
        const weekNumber = await refreshCurrentWeekNumber();
        // Credentials were probably just filled in: show the timetable if the
        // currently selected week is not part of the fetched data.
        if (weekNumber > 0 && !getTemporaryTimetablesStore(selectedWeekNumber())) {
          setSelectedWeekNumber(weekNumber);
        }
      })();
    },
  );

  return (
    <>
      <SettingsModal open={settingsOpen()} setOpen={setSettingsOpen} />

      <SwiperView
        setSettingsOpen={setSettingsOpen}
        header={selectedWeekTimetable()?.header}
        lessons={selectedWeekTimetable()?.lessons}
        currentWeekLessons={currentWeekTimetable()?.lessons}
        currentWeekHeader={currentWeekTimetable()?.header}
        nextWeekLessons={nextWeekTimetable()?.lessons}
        nextWeekHeader={nextWeekTimetable()?.header}
        selectedWeekLessons={selectedWeekTimetable()?.lessons}
        selectedWeekNumber={selectedWeekNumber()}
        setWeekNumber={setSelectedWeekNumber}
        isCurrentlyInVacation={isCurrentlyInVacation()}
        error={error()}
      />
    </>
  );
};

export default Page;

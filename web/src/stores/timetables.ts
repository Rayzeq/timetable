import { createStore } from "solid-js";

import localforage from "localforage";
import type { DateTime } from "luxon";

import type { ApiTimetableMeta, ITimetable } from "~/types/api";
import type { IClientTimetable } from "~/types/client";
import { normalizeTimetable } from "~/utils/lessons";
import { APIError, APIErrorType } from "~/utils/errors";

type YearSTR = "A1" | "A2" | "A3";
const makeYearSTR = (year: number) => `A${year}` as YearSTR;
const makeWeekSTR = (week_number: number) => `S${week_number}` as const;

/**
 * the meta list is the freshness source: it carries `last_update` per week,
 * so cached weeks are refetched only when the server actually has a newer
 * version. the server answers meta revalidations with 304s, so refreshing
 * it often is nearly free.
 */
const META_TTL = 1000 * 60 * 5;
/** blind fallback when the meta is unreachable. */
const WEEK_FALLBACK_TTL = 1000 * 60 * 60;

interface TimetableMeta {
  /** Timestamp of the last time that timetable was fetched from server. */
  last_fetch: number
  timetables: ApiTimetableMeta["data"]
}

type StoredTimetable = ITimetable & { last_fetch: number };

const [temporaryTimetablesStore, setTemporaryTimetablesStore] = createStore<Record<YearSTR, Record<`S${number}`, IClientTimetable | undefined>>>({
  A1: {},
  A2: {},
  A3: {}
});

/**
 * Simplified getter for the temporary store.
 */
export const getTemporaryTimetablesStore = (year: number, week_number: number): IClientTimetable | null => {
  // When we're loading, current week is `-1` and next week may be `-1 | 0`, don't show anything.
  if (week_number < 1) return null;
  return temporaryTimetablesStore[makeYearSTR(year)][makeWeekSTR(week_number)] ?? null;
};

const setTemporaryTimetable = (year: number, week_number: number, timetable: IClientTimetable) => {
  setTemporaryTimetablesStore((state) => {
    state[makeYearSTR(year)][makeWeekSTR(week_number)] = timetable;
  });
};

const getTimetableMetaStore = async (year: number, forceRefreshAll = false): Promise<TimetableMeta> => {
  const key = "timetables-meta-" + makeYearSTR(year);
  const metadataInStorage = localStorage.getItem(key);

  const renew = async () => {
    const response = await fetch(`/api/timetables/${makeYearSTR(year)}`);
    if (!response.ok) throw new APIError(APIErrorType.NO_CACHE);
    const { data: timetables } = await response.json() as ApiTimetableMeta;

    const meta: TimetableMeta = {
      last_fetch: Date.now(),
      timetables
    };

    localStorage.setItem(key, JSON.stringify(meta));
    return meta;
  };

  /** Used in case we're using `forceRefreshAll` while being offline. */
  let stored_meta: TimetableMeta | undefined;

  if (metadataInStorage) {
    try {
      stored_meta = JSON.parse(metadataInStorage) as TimetableMeta;

      const diff = Date.now() - stored_meta.last_fetch;

      if (diff < META_TTL) {
        // if we don't force refresh all, we can return the cache.
        if (!forceRefreshAll) {
          return stored_meta;
        }
      }
      else {
        try {
          return await renew();
        }
        catch {
          // No internet connection, return the old cache.
          return stored_meta;
        }
      }
    }
    catch { /** No-op since non-parsable. */ }
  }

  try {
    return await renew();
  }
  catch {
    if (forceRefreshAll && stored_meta) {
      return stored_meta;
    }

    // No internet connection, throw a cache error.
    throw new APIError(APIErrorType.NO_CACHE);
  }
};

/**
 * used only when we're in vacation.
 */
export const getLatestWeekNumber = async (year: number): Promise<number> => {
  const metas = await getTimetableMetaStore(year);

  const last_timetable = metas.timetables[metas.timetables.length - 1];
  return last_timetable.week_number;
};

/**
 * Get the week number of a given day.
 */
export const getDayWeekNumber = async (day: DateTime, year: number, forceRefreshMetas = false): Promise<number> => {
  const metas = await getTimetableMetaStore(year, forceRefreshMetas);

  const timetable_meta = metas.timetables.find(
    meta => meta.week_number_in_year === day.weekNumber
  );

  // when it's not found there's two possibilities:
  // - we're in vacation (so latest timetable is the last one)
  // - outdated cache (so we need to fetch the entire list again)
  if (!timetable_meta) {
    // try to see if we're in outdated cache.
    if (!forceRefreshMetas) {
      return getDayWeekNumber(day, year, true);
    }

    // we're in vacation, to be handled by the caller (main Page view).
    throw new APIError(APIErrorType.NOT_FOUND);
  }

  return timetable_meta.week_number;
};

/** @param year - Example: "A1" */
const getTimetableStore = (year: string) => localforage.createInstance({
  name: "timetables",
  storeName: year
});

/**
 * Fetches the timetable and puts it in cache.
 */
const fetchTimetableWithoutCache = async (year: number, week_number: number): Promise<ITimetable> => {
  try {
    const response = await fetch("/api/timetable/" + makeYearSTR(year) + "/" + week_number.toString());
    if (response.status === 404) throw new APIError(APIErrorType.NOT_FOUND);
    if (!response.ok) throw new APIError(APIErrorType.NO_CACHE);

    const { data: timetable } = await response.json() as { data: ITimetable };
    await getTimetableStore(makeYearSTR(year)).setItem<StoredTimetable>(
      makeWeekSTR(week_number), { ...timetable, last_fetch: Date.now() }
    );

    return timetable;
  }
  catch (error) {
    if (error instanceof APIError && error.type === APIErrorType.NOT_FOUND) {
      throw error;
    }

    throw new APIError(APIErrorType.NO_CACHE);
  }
};

/**
 * whether a stored week should be refetched: compare its `last_update`
 * against the meta list - precise invalidation, updates land within
 * minutes. without a usable meta, fall back to a blind ttl.
 */
const shouldRefetchStored = async (year: number, week_number: number, stored: StoredTimetable): Promise<boolean> => {
  try {
    const metas = await getTimetableMetaStore(year);
    const meta = metas.timetables.find(meta => meta.week_number === week_number);

    // unknown to the meta: nothing newer to fetch.
    if (!meta) return false;
    return meta.last_update !== stored.last_update;
  }
  catch {
    return Date.now() - stored.last_fetch >= WEEK_FALLBACK_TTL;
  }
};

/** identical refreshes running concurrently share a single request. */
const inflightRefreshes = new Map<string, Promise<void>>();

/**
 * Refreshes the `temporaryTimetablesStore` store for a given week number.
 * This value will then be reactive in the views that use it,
 * and can be refreshed in background without having to wait
 * until the end of the request - if any was done.
 *
 * @param year - ex.: `1`
 * @param week_number - ex.: `12`
 */
export const refreshTimetableForWeekNumber = (year: number, week_number: number): Promise<void> => {
  const key = `${year}:${week_number}`;

  const existing = inflightRefreshes.get(key);
  if (existing) return existing;

  const refresh = doRefreshTimetableForWeekNumber(year, week_number)
    .finally(() => inflightRefreshes.delete(key));

  inflightRefreshes.set(key, refresh);
  return refresh;
};

const doRefreshTimetableForWeekNumber = async (year: number, week_number: number): Promise<void> => {
  const stored_timetable = await getTimetableStore(makeYearSTR(year)).getItem<StoredTimetable>(makeWeekSTR(week_number));

  if (stored_timetable) {
    // Store the cached value in the temporary store
    // to directly show it in the user interface.
    setTemporaryTimetable(year, week_number, normalizeTimetable(stored_timetable));

    if (!await shouldRefetchStored(year, week_number, stored_timetable)) {
      return;
    }
  }

  try {
    // We don't have a cache, or the server has a newer version.
    const timetable = await fetchTimetableWithoutCache(year, week_number);
    setTemporaryTimetable(year, week_number, normalizeTimetable(timetable));
  }
  catch (error) {
    if (error instanceof APIError) {
      // We have an outdated cache but no connection, so we'll just stay with the outdated cache.
      // It's better than nothing.
      if (error.type === APIErrorType.NO_CACHE && stored_timetable) return;
    }

    throw error;
  }
};

export const resetAppCache = async (): Promise<void> => {
  for (const year of [1, 2, 3]) {
    await getTimetableStore(`A${year}`).clear();
    localStorage.removeItem("timetables-meta-" + makeYearSTR(year));
  }
};

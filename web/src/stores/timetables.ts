import type { DateTime } from "luxon";
import { DateTime as LuxonDateTime } from "luxon";
import { createStore } from "solid-js";
import localforage from "localforage";

import type {
  ApiErrorResponse,
  ApiEvent,
  ApiEventsResponse,
  ITimetable,
  ITimetableHeader,
  ITimetableLesson,
  LessonType,
} from "~/types/api";
import type { IClientLesson, IClientTimetable } from "~/types/client";
import { APIError, apiErrorTypeFromCode, APIErrorType, getAPIErrorMessage } from "~/utils/errors";
import { normalizeAndMergeLessons, normalizeTimetable } from "~/utils/lessons";
import { hasCredentials, preferences } from "./preferences";

interface TimetablesStoreState {
  weeks: Record<number, IClientTimetable | undefined>;
  meta: ITimetableHeader[];
  lastUpdate: string;
  /**
   * Set when the last fetch failed and cached data is shown instead.
   * `null` means the displayed data comes from a successful fetch.
   */
  cacheFallback: CacheFallbackReason | null;
  /**
   * Localized explanation of the last failed refresh, displayed next to the
   * cached-data notice. `null` when there is no error to report.
   */
  cacheFallbackMessage: string | null;
  /**
   * True while cached data is displayed and a server refresh is in flight.
   * Gives the user feedback that the shown timetable is cached and being
   * updated.
   */
  refreshingFromCache: boolean;
}

/**
 * Why the app had to fall back to the local cache:
 * - `offline`: the request never reached the server (network error).
 * - `server`: the server responded with an error (or an invalid payload).
 */
export type CacheFallbackReason = "offline" | "server";

export const [timetablesStore, setTimetablesStore] = createStore<TimetablesStoreState>({
  weeks: {},
  meta: [],
  lastUpdate: "",
  cacheFallback: null,
  cacheFallbackMessage: null,
  refreshingFromCache: false,
});

export const getTemporaryTimetablesStore = (week_number: number): IClientTimetable | null => {
  if (week_number < 1) return null;
  return timetablesStore.weeks[week_number] ?? null;
};

export const parseEventToLesson = (event: ApiEvent): ITimetableLesson => {
  if (event.title === "Férié") {
    return {
      start_date: event.start,
      end_date: event.end,
      type: "Férié",
      content: {
        is_cancelled: false,
        lesson_name: "Jour férié",
        description: undefined,
        room: "",
        teacher: "",
        group: undefined,
        type: "Férié",
      },
    };
  }

  const lines = event.title
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let is_cancelled = false;
  let lessonName: string | undefined;
  let teacher: string | undefined;
  let room: string | undefined;
  let kind: string | undefined;
  let memo: string | undefined;
  let group: string | undefined;

  for (const line of lines) {
    if (line.startsWith("Matière :")) {
      lessonName = line
        .replace(/^Matière : /, "")
        .replace(/^UCE /, "")
        .trim();
    } else if (line.startsWith("Enseignant :")) {
      teacher = line.replace(/^Enseignant : /, "").trim();
    } else if (line.startsWith("Enseignants :")) {
      teacher = line.replace(/^Enseignants : /, "").trim();
    } else if (line.startsWith("Salle :")) {
      room = line.replace(/^Salle : /, "").trim();
    } else if (line.startsWith("Salles :")) {
      room = line.replace(/^Salles : /, "").trim();
    } else if (line.startsWith("Type :")) {
      kind = line.replace(/^Type : /, "").trim();
    } else if (line.startsWith("Annulation :")) {
      is_cancelled = true;
    } else if (line.startsWith("Mémo :")) {
      memo = line.replace(/^Mémo : /, "").trim();
    } else if (line.startsWith("TD :") || line.startsWith("Promotions :")) {
      group = line
        .replace(/^TD : /, "")
        .replace(/^Promotions : /, "")
        .trim();
    } else {
      console.warn(`Donnée inconnue: ${line}`);
    }
  }

  let lessonType: LessonType;
  if (kind === "CM/TD" && event.type === "CM") {
    event.type = kind;
  }
  if (event.type === "Annulation") {
    is_cancelled = true;
    event.type = kind || "";
  }
  if (kind && event.type !== kind) {
    console.error(`Mismatched event types: ${event.type} and ${kind}`);
    event.type = kind;
  }
  if (event.type === "CM") lessonType = "CM";
  else if (event.type === "CM/TD") lessonType = "CM/TD";
  else if (event.type === "TD") lessonType = "TD";
  else if (event.type === "TP") lessonType = "TP";
  else if (event.type === "Evaluation") lessonType = "Évaluation";
  else if (event.type === "") lessonType = "Autre";
  else {
    console.warn(`Unknown lesson type: ${event.type}`);
    lessonType = "Autre";
  }

  let room_clean = room || "Inconnue";
  room_clean = room_clean.replace(/C (?=\d{3})/, "C");
  room_clean = room_clean.replace("=", "/");

  return {
    start_date: event.start,
    end_date: event.end,
    type: lessonType,
    content: {
      is_cancelled,
      lesson_name: lessonName,
      description: memo,
      room: room_clean,
      teacher: teacher || "Inconnu",
      group: group,
      type: kind,
    },
  };
};

const processTimetableJson = (json: { success: true; data: ApiEventsResponse }) => {
  const events = json.data.events;
  const updateName = json.data.name;

  const weeksMap = new Map<number, ITimetableLesson[]>();

  for (const event of events) {
    const dt = LuxonDateTime.fromISO(event.start);
    if (!dt.isValid) continue;
    const weekNumber = dt.weekNumber;
    if (!weeksMap.has(weekNumber)) {
      weeksMap.set(weekNumber, []);
    }
    weeksMap.get(weekNumber)!.push(parseEventToLesson(event));
  }

  const newWeeks: Record<number, IClientTimetable> = {};
  const newMeta: ITimetableHeader[] = [];

  for (const [weekNumber, rawLessons] of weeksMap.entries()) {
    const firstDt = LuxonDateTime.fromISO(rawLessons[0].start_date);
    const startOfWeek = firstDt.startOf("week");
    const endOfWeek = firstDt.startOf("week").plus({ days: 5 });

    const header: ITimetableHeader = {
      start_date: startOfWeek.toISO() ?? "",
      end_date: endOfWeek.toISO() ?? "",
      week_number: weekNumber,
      week_number_in_year: weekNumber,
    };

    newMeta.push(header);
    const timetable: ITimetable = {
      header,
      lessons: rawLessons,
      last_update: updateName || "",
    };
    const normalized = normalizeTimetable(timetable);
    normalized.lessons = normalizeAndMergeLessons(normalized.lessons);
    newWeeks[weekNumber] = normalized;
  }

  newMeta.sort((a, b) => a.week_number - b.week_number);

  setTimetablesStore((state) => {
    state.weeks = newWeeks;
    state.meta = newMeta;
    state.lastUpdate = updateName || "";
  });
};

const setCacheFallback = (reason: CacheFallbackReason | null, message: string | null = null) => {
  setTimetablesStore((state) => {
    state.cacheFallback = reason;
    state.cacheFallbackMessage = reason ? message : null;
  });
};

const setRefreshingFromCache = (refreshing: boolean) => {
  setTimetablesStore((state) => {
    state.refreshingFromCache = refreshing;
  });
};

type CachedTimetablePayload = { success: true; data: ApiEventsResponse };

const readCachedTimetable = async (): Promise<CachedTimetablePayload | null> => {
  try {
    return await localforage.getItem<CachedTimetablePayload>("timetable-cache");
  } catch (error) {
    console.error("[timetable]: could not read the cache.", error);
    return null;
  }
};

/**
 * Processes the locally cached timetable instead of the remote one.
 * @param reason - Why the cache is used, or `null` when the cache is known to
 * be up-to-date (e.g. a 304 response).
 * @returns `true` if a cached timetable was found and processed.
 */
const useCachedTimetable = async (
  reason: CacheFallbackReason | null,
  message: string | null = null,
): Promise<boolean> => {
  const cached = await readCachedTimetable();
  if (!cached) return false;

  processTimetableJson(cached);
  setCacheFallback(reason, message);
  setRefreshingFromCache(false);
  return true;
};

/**
 * Reads the API error payload and maps its stable code to a localized error
 * type. The diagnostic message is only logged: the UI must stay in French.
 */
const readErrorType = async (response: Response): Promise<APIErrorType> => {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    if (payload?.message) {
      console.error(`[timetable]: backend error: ${payload.message}`);
    }
    return apiErrorTypeFromCode(payload?.code);
  } catch (error) {
    console.error("[timetable]: the server did not return a JSON error payload.", error);
    return APIErrorType.SERVER_ERROR;
  }
};

/**
 * Fetches the timetable from the server, falling back to the cache when the
 * request fails.
 */
const fetchRemoteTimetable = async (): Promise<void> => {
  let response: Response;
  try {
    response = await fetch("/api/timetable", {
      headers: {
        "x-username": preferences.username,
        "x-password": preferences.password,
      },
    });
  } catch (error) {
    console.error("[timetable]: the server could not be reached.", error);
    if (await useCachedTimetable("offline")) return;
    setCacheFallback(null);
    setRefreshingFromCache(false);
    throw new APIError(APIErrorType.NO_CACHE);
  }

  // A 304 means the cached response is still fresh, no need to display a warning.
  if (response.status === 304) {
    if (await useCachedTimetable(null)) return;
  } else if (!response.ok) {
    const errorType = await readErrorType(response);
    console.error(`[timetable]: the server responded with ${response.status} (${errorType}).`);
    if (await useCachedTimetable("server", getAPIErrorMessage(errorType))) return;
    setCacheFallback(null);
    setRefreshingFromCache(false);
    throw new APIError(errorType);
  }

  let json: CachedTimetablePayload;
  try {
    json = (await response.json()) as CachedTimetablePayload;
  } catch (error) {
    console.error("[timetable]: invalid response from the server.", error);
    if (await useCachedTimetable("server", getAPIErrorMessage(APIErrorType.SERVER_ERROR))) return;
    setCacheFallback(null);
    setRefreshingFromCache(false);
    throw new APIError(APIErrorType.SERVER_ERROR);
  }

  // Display the fresh data before writing the cache, so the UI updates as
  // soon as the response is received.
  processTimetableJson(json);
  setCacheFallback(null);
  setRefreshingFromCache(false);

  try {
    await localforage.setItem("timetable-cache", json);
  } catch (error) {
    // Not being able to write the cache must not prevent displaying fresh data.
    console.error("[timetable]: could not write to the cache.", error);
  }
};

/**
 * Runs a remote refresh, reusing the request already in flight for the same
 * credentials (the app can trigger several refreshes on startup).
 */
let inFlightRemoteFetch: { key: string; promise: Promise<void> } | null = null;

const refreshRemoteTimetable = (): Promise<void> => {
  const key = `${preferences.username}\u0000${preferences.password}`;

  if (inFlightRemoteFetch?.key === key) {
    return inFlightRemoteFetch.promise;
  }

  const promise = fetchRemoteTimetable().finally(() => {
    if (inFlightRemoteFetch?.promise === promise) inFlightRemoteFetch = null;
  });

  inFlightRemoteFetch = { key, promise };
  return promise;
};

export const fetchAndProcessTimetable = async (): Promise<void> => {
  // Never hit the server without credentials: the request cannot succeed and
  // a dedicated error message is more useful than a generic server error.
  if (!hasCredentials()) {
    setCacheFallback(null);
    setRefreshingFromCache(false);
    throw new APIError(APIErrorType.MISSING_CREDENTIALS);
  }

  // On first load, show cached data immediately instead of keeping the user
  // on a loading screen while a slow server answers. The remote response is
  // processed as soon as it arrives.
  if (Object.keys(timetablesStore.weeks).length === 0) {
    const cached = await readCachedTimetable();
    if (cached) {
      processTimetableJson(cached);
      setCacheFallback(null);
      setRefreshingFromCache(true);
      void refreshRemoteTimetable().catch((error) => {
        console.error("[timetable]: background refresh failed.", error);
        setRefreshingFromCache(false);
      });
      return;
    }
  }

  await refreshRemoteTimetable();
};

export const getDayWeekNumber = async (day: DateTime): Promise<number> => {
  if (Object.keys(timetablesStore.weeks).length === 0) {
    await fetchAndProcessTimetable();
  }

  const meta = timetablesStore.meta.find((m) => m.week_number_in_year === day.weekNumber);
  if (!meta) {
    if (timetablesStore.meta.length > 0) {
      throw new APIError(APIErrorType.NOT_FOUND);
    }
    throw new APIError(APIErrorType.NO_CACHE);
  }
  return meta.week_number;
};

/**
 * All the lessons of every loaded week, sorted chronologically. Used by the
 * ICS export so it contains the whole timetable instead of a single week.
 */
export const getAllLessons = (): IClientLesson[] =>
  Object.values(timetablesStore.weeks)
    .filter((timetable): timetable is IClientTimetable => timetable !== undefined)
    .flatMap((timetable) => timetable.lessons)
    .sort((a, b) => a.start_ts - b.start_ts);

export const getNextWeekNumber = (weekNumber: number): number | null => {
  const nextMeta = timetablesStore.meta.find((m) => m.week_number > weekNumber);
  return nextMeta ? nextMeta.week_number : null;
};

export const getNextWeekTimetable = (weekNumber: number): IClientTimetable | null => {
  const nextNum = getNextWeekNumber(weekNumber);
  return nextNum !== null ? getTemporaryTimetablesStore(nextNum) : null;
};

export const refreshTimetable = async (): Promise<void> => {
  await fetchAndProcessTimetable();
};

export const resetAppCache = async (): Promise<void> => {
  localStorage.clear();
  await localforage.clear();
  setTimetablesStore((state) => {
    state.weeks = {};
    state.meta = [];
    state.lastUpdate = "";
    state.cacheFallback = null;
    state.cacheFallbackMessage = null;
    state.refreshingFromCache = false;
  });
};

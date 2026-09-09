import type { DateTime } from "luxon";
import { DateTime as LuxonDateTime } from "luxon";
import { createStore } from "solid-js";
import localforage from "localforage";

import type { ApiEvent, ApiEventsResponse, ITimetable, ITimetableHeader, ITimetableLesson, LessonType } from "~/types/api";
import type { IClientTimetable } from "~/types/client";
import { APIError, APIErrorType } from "~/utils/errors";
import { normalizeAndMergeLessons, normalizeTimetable } from "~/utils/lessons";
import { preferences } from "./preferences";

interface TimetablesStoreState {
  weeks: Record<number, IClientTimetable | undefined>;
  meta: ITimetableHeader[];
  lastUpdate: string;
}

export const [timetablesStore, setTimetablesStore] = createStore<TimetablesStoreState>({
  weeks: {},
  meta: [],
  lastUpdate: "",
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

export const fetchAndProcessTimetable = async (): Promise<void> => {
  try {
    const response = await fetch("/api/timetable", {
      headers: {
        "x-username": preferences.username,
        "x-password": preferences.password,
      },
    });

    if (!response.ok) {
      throw new APIError(APIErrorType.NO_CACHE);
    }

    const json = (await response.json()) as { success: true; data: ApiEventsResponse };
    await localforage.setItem("timetable-cache", json);
    processTimetableJson(json);
  } catch (error) {
    const cached = await localforage.getItem<{ success: true; data: ApiEventsResponse }>("timetable-cache");
    if (cached) {
      processTimetableJson(cached);
      return;
    }
    if (error instanceof APIError) throw error;
    throw new APIError(APIErrorType.NO_CACHE);
  }
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
  });
};

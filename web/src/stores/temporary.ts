import { createSignal } from "solid-js";
import { DateTime } from "luxon";

// Global current time signal for the whole app.
// ! Not to use when comparing `diff` on fetch though.
//
// nothing in the ui shows seconds, so the signal only propagates when the
// minute changes - downstream memos recompute 60x less than with a raw
// one second tick.
const initial = DateTime.now();
const [now, setNow] = createSignal(initial);
export { now };

const minuteKey = (date: DateTime) => `${date.day}:${date.hour}:${date.minute}`;

let __last_minute_key = minuteKey(initial);
let __cached_interval: ReturnType<typeof setInterval> | undefined;

export const initializeNowRefresh = () => {
  // Clear if already initialized before.
  if (__cached_interval) {
    clearInterval(__cached_interval);
  }

  // checked every second so a minute flip lands at most one second late.
  __cached_interval = setInterval(() => {
    const next = DateTime.now();
    const key = minuteKey(next);

    if (key !== __last_minute_key) {
      __last_minute_key = key;
      setNow(next);
    }
  }, 1000);
};

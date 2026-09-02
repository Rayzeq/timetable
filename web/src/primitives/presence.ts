import { createEffect, createSignal, untrack } from "solid-js";
import type { Accessor } from "solid-js";

/**
 * keeps kobalte content mounted after it closes until the css exit animations
 * of the given elements end - feed the result to the `forceMount` prop.
 * kobalte 2 alpha unmounts right away otherwise.
 */
export const createPresence = (
  open: Accessor<boolean>,
  animated: Accessor<Array<Element | undefined>>
): Accessor<boolean> => {
  const [isMounted, setMounted] = createSignal(untrack(open));

  createEffect(() => open(), (open) => {
    if (open) {
      setMounted(true);
      return;
    }

    // the closed data attribute is already rendered here, so these are the exit animations.
    const animations = untrack(animated)
      .flatMap((element) => element?.getAnimations() ?? []);

    if (animations.length === 0) {
      setMounted(false);
      return;
    }

    let cancelled = false;
    Promise.allSettled(animations.map((animation) => animation.finished))
      .then(() => { if (!cancelled) setMounted(false); });

    // reopening before the end keeps everything mounted.
    return () => { cancelled = true; };
  });

  return isMounted;
};

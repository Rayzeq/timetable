import { createSignal, onSettled } from "solid-js";
import type { Accessor } from "solid-js";

/** reactive `window.matchMedia`, cleaned up with the owning component. */
export const createMediaQuery = (query: string): Accessor<boolean> => {
  const media = window.matchMedia(query);
  const [matches, setMatches] = createSignal(media.matches);

  onSettled(() => {
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  });

  return matches;
};

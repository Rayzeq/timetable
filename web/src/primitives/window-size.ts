import { createStore, onSettled } from "solid-js";

/** reactive window dimensions, cleaned up with the owning component. */
export const createWindowSize = () => {
  const [size, setSize] = createStore({
    width: window.innerWidth,
    height: window.innerHeight
  });

  onSettled(() => {
    const update = () => setSize((state) => {
      state.width = window.innerWidth;
      state.height = window.innerHeight;
    });

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  });

  return size;
};

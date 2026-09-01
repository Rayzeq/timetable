import { Show, createEffect } from "solid-js";
import type { ParentComponent, Setter } from "solid-js";
import { Portal } from "@solidjs/web";

import MdiClose from "~icons/mdi/close";

// hand-rolled dialog - kobalte does not support solid 2 yet.
export const Modal: ParentComponent<{
  title: string,
  open: boolean,
  setOpen?: Setter<boolean>,
  onClose?: () => unknown
}> = (props) => {
  const close = () => {
    if (typeof props.setOpen === "undefined") props.onClose?.();
    else props.setOpen(false);
  };

  // the returned cleanup also runs on disposal, restoring the body scroll.
  createEffect(() => props.open, (open) => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="animate-fade-in animate-duration-150 fixed inset-0 z-50 bg-[rgba(21,21,21,.6)] laptop-sm:backdrop-blur-md" />

        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-auto"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={props.title}
            class="animate-scale-in animate-duration-200 bg-[rgb(32,32,32)] rounded-lg max-w-[450px] w-full my-auto"
          >
            <div class="relative flex item justify-between items-center mb-2 border-b border-b-[rgb(90,90,90)] p-4 text-[rgb(220,220,220)]">
              <h2 class="text-[20px] font-medium">
                {props.title}
              </h2>
              <button type="button" class="flex items-center justify-center p-1" onClick={() => close()}>
                <MdiClose class="text-lg" />
              </button>
            </div>

            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
};

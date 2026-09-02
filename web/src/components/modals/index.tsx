import { createEffect, createSignal } from "solid-js";
import type { ParentComponent } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { createPresence } from "~/primitives/presence";

import MdiClose from "~icons/mdi/close";

export const Modal: ParentComponent<{
  title: string,
  open: boolean,
  onClose: () => void
}> = (props) => {
  const [overlay, setOverlay] = createSignal<HTMLElement>();
  const [content, setContent] = createSignal<HTMLElement>();
  const isMounted = createPresence(() => props.open, () => [overlay(), content()]);

  // kobalte hands focus back to a trigger, these modals are opened programmatically instead.
  let opener: HTMLElement | null = null;
  createEffect(() => props.open, (open) => {
    if (open) opener = document.activeElement as HTMLElement | null;
  });

  return (
    <Dialog open={props.open} forceMount={isMounted()}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay ref={setOverlay}
          class="fixed inset-0 z-50 bg-[rgba(21,21,21,.6)] laptop-sm:backdrop-blur-md animate-kb-fade"
        />

        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-auto">
          <Dialog.Content ref={setContent}
            onCloseAutoFocus={() => opener?.focus({ preventScroll: true })}
            class="bg-[rgb(32,32,32)] rounded-lg max-w-[450px] w-full my-auto outline-none animate-kb-scale"
          >
            <div class="flex justify-between items-center mb-2 border-b border-b-[rgb(90,90,90)] p-4 text-[rgb(220,220,220)]">
              <Dialog.Title class="text-[20px] font-medium">
                {props.title}
              </Dialog.Title>
              <Dialog.CloseButton class="flex items-center justify-center p-1" aria-label="Fermer">
                <MdiClose class="text-lg" />
              </Dialog.CloseButton>
            </div>

            {props.children}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
};

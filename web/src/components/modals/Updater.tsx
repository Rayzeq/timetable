import { createSignal } from "solid-js";
import type { Component } from "solid-js";
import { registerSW } from "virtual:pwa-register";
import { Modal } from "~/components/modals";

import MdiUpdate from "~icons/mdi/update";

const [needRefresh, setNeedRefresh] = createSignal(false);

const updateServiceWorker = registerSW({
  onNeedRefresh: () => setNeedRefresh(true),
  onRegisteredSW: (_url, registration) => {
    console.info("[service-worker]: registered, starting the update checking interval.");

    // check for updates every hour, useful when the app stays open.
    if (registration) {
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    }
  },
  onRegisterError: (error) => {
    console.error("[service-worker]: an error was produced.", error);
  }
});

const Updater: Component = () => {
  const closeNoReload = () => {
    setNeedRefresh(false);
  };

  return (
    <Modal title="Mise à jour"
      open={needRefresh()}
      onClose={() => closeNoReload()}
    >
      <div class="p-4 flex flex-col gap-4">
        <div class="flex items-center justify-center gap-2">
          <MdiUpdate class="text-red" />
          <p class="text-[rgb(230,230,230)]">
            Une nouvelle mise à jour est disponible !
          </p>
        </div>

        <p class="text-sm text-center text-[rgb(190,190,190)]">
          Redémarrez l'application pour en profiter dès maintenant.
        </p>
      </div>

      <div class="h-[1px] w-full border-b border-b-[rgb(90,90,90)]" />

      <div class="p-4 flex justify-end gap-6">
        <button type="button" onClick={() => closeNoReload()}
          class="px-4 py-2 rounded-lg hover:bg-[rgb(36,36,36)] active:bg-[rgb(42,42,42)] text-[rgb(220,220,220)] active:text-[rgb(230,230,230)] transition-colors duration-200"
        >
          Plus tard
        </button>
        <button type="button" onClick={() => updateServiceWorker(true)}
          class="px-4 py-2 rounded-lg bg-red text-[rgb(18,18,18)] font-medium"
        >
          Redémarrer
        </button>
      </div>
    </Modal>
  );
};

export default Updater;

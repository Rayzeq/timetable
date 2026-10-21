import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";

import { refreshTimetable, timetablesStore } from "~/stores/timetables";
import MdiAlertOutline from "~icons/mdi/alert-outline";
import MdiCloudOffOutline from "~icons/mdi/cloud-off-outline";
import MdiLoading from "~icons/mdi/loading";
import MdiRefresh from "~icons/mdi/refresh";

/**
 * Fixed banner telling the user that the displayed timetable comes from the
 * local cache.
 *
 * - While the server request is pending, it shows a calm "refreshing..." state.
 * - If the request fails, it turns into a warning and offers a retry button.
 *
 * It stays at the bottom of the screen (above the phone's safe area) so it
 * remains visible while scrolling.
 */
const CachedDataNotice: Component = () => {
  const [retrying, setRetrying] = createSignal(false);

  const hasFallback = () => timetablesStore.cacheFallback !== null;
  const isVisible = () => hasFallback() || timetablesStore.refreshingFromCache;

  const retry = async () => {
    if (retrying()) return;

    setRetrying(true);
    try {
      await refreshTimetable();
    } catch (error) {
      console.error("[timetable]: retry failed.", error);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Show when={isVisible()}>
      <>
        {/* Keep enough room at the bottom so the banner never hides content. */}
        <div aria-hidden="true" style={{ height: "7rem" }} />

        <div
          role="status"
          aria-live="polite"
          class={[
            "fixed inset-x-0 bottom-0 z-40 flex items-start gap-3 border-t-2 px-4 pt-3 shadow-[0_-6px_24px_rgba(0,0,0,0.55)]",
            hasFallback()
              ? "border-[rgb(255,179,0)] bg-[rgb(45,33,10)] text-[rgb(235,220,185)]"
              : "border-[rgb(96,144,205)] bg-[rgb(23,32,45)] text-[rgb(210,222,238)]",
          ]}
          style={{ "padding-bottom": "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Show
            when={timetablesStore.cacheFallback}
            fallback={
              <>
                <MdiLoading class="text-xl shrink-0 mt-[2px] text-[rgb(130,180,240)] animate-spin" />

                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-[rgb(170,205,245)]">Données en cache</p>
                  <p class="text-xs leading-snug">Actualisation auprès du serveur…</p>
                </div>
              </>
            }
          >
            {(reason) => (
              <>
                <Show
                  when={reason() === "offline"}
                  fallback={<MdiAlertOutline class="text-xl shrink-0 mt-[2px] text-[rgb(255,179,0)]" />}
                >
                  <MdiCloudOffOutline class="text-xl shrink-0 mt-[2px] text-[rgb(255,179,0)]" />
                </Show>

                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-[rgb(255,200,80)]">
                    {reason() === "offline" ? "Serveur injoignable" : "Mise à jour impossible"}
                  </p>
                  <p class="text-xs leading-snug">
                    {timetablesStore.cacheFallbackMessage ?? "Affichage des données en cache, elles peuvent être obsolètes."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={retry}
                  disabled={retrying()}
                  class="flex shrink-0 items-center gap-[6px] rounded-lg bg-[rgb(255,179,0)] px-3 py-2 text-xs font-semibold text-[rgb(35,25,5)] transition-colors hover:bg-[rgb(255,200,80)] active:bg-[rgb(255,215,130)] disabled:opacity-60"
                >
                  <MdiRefresh class={["text-base", retrying() && "animate-spin"]} />
                  <span>{retrying() ? "..." : "Réessayer"}</span>
                </button>
              </>
            )}
          </Show>
        </div>
      </>
    </Show>
  );
};

export default CachedDataNotice;

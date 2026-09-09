import type { Component, Setter } from "solid-js";
import { For } from "solid-js";
import { Modal } from "~/components/modals";

import {
  DEFAULT_USER_CUSTOMIZATION,
  getUserCustomizationKey,
  preferences,
  setPassword,
  setUserCustomization,
  setUsername,
} from "~/stores/preferences";
import { resetAppCache } from "~/stores/timetables";
import { hexToRgb, rgbToHex } from "~/utils/colors";

const PRESET_COLORS: Array<string> = [
  DEFAULT_USER_CUSTOMIZATION.primary_color,
  "255, 125, 66",
  "250, 200, 60",
  "96, 200, 90",
  "66, 184, 255",
  "125, 96, 255",
  "255, 96, 190",
  "230, 230, 230",
];

export const SettingsModal: Component<{
  open: boolean;
  setOpen: Setter<boolean>;
}> = (props) => {
  const userPrimaryColor = () => getUserCustomizationKey("primary_color");
  const userPrimaryColorHEX = () => {
    const [r, g, b] = userPrimaryColor().split(",").map(Number);
    return rgbToHex(r, g, b);
  };

  const setPrimaryColor = (color: string) => {
    if (color === userPrimaryColor()) return;

    setUserCustomization({
      ...preferences.customization,
      primary_color: color,
    });
  };

  return (
    <Modal title="Paramètres" open={props.open} onClose={() => props.setOpen(false)}>
      <div class="p-4 flex flex-col gap-6">
        <section>
          <h3 class="text-[rgb(240,240,240)] text-[18px] mb-2">Identifiants CAS</h3>

          <div class="flex flex-col gap-3">
            <div>
              <label class="block text-xs text-[rgb(190,190,190)] mb-1">Nom d'utilisateur</label>
              <input
                type="text"
                class="w-full bg-[rgb(40,40,40)] border border-[rgb(70,70,70)] rounded-lg px-3 py-2 text-[rgb(240,240,240)] outline-none focus:border-red"
                value={preferences.username}
                onInput={(e) => setUsername(e.currentTarget.value)}
                placeholder="Nom d'utilisateur"
              />
            </div>
            <div>
              <label class="block text-xs text-[rgb(190,190,190)] mb-1">Mot de passe</label>
              <input
                type="password"
                class="w-full bg-[rgb(40,40,40)] border border-[rgb(70,70,70)] rounded-lg px-3 py-2 text-[rgb(240,240,240)] outline-none focus:border-red"
                value={preferences.password}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="Mot de passe"
              />
            </div>
          </div>

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">Vos identifiants servent à récupérer votre emploi du temps personnel via CAS.</p>
        </section>

        <section>
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-[rgb(240,240,240)] text-[18px] flex">Couleur de l'interface</h3>
            <div class="w-4 h-4 rounded-full" style={{ "background-color": `rgb(${userPrimaryColor()})` }}></div>
          </div>

          <div class="flex items-center flex-wrap gap-3">
            <For each={PRESET_COLORS}>
              {(color) => (
                <button
                  type="button"
                  aria-label={`Couleur ${color}`}
                  class={[
                    "w-8 h-8 rounded-full transition-transform hover:scale-110",
                    userPrimaryColor() === color && "ring-2 ring-white ring-offset-2 ring-offset-[rgb(32,32,32)]",
                  ]}
                  style={{ "background-color": `rgb(${color})` }}
                  onClick={() => setPrimaryColor(color)}
                />
              )}
            </For>

            <label class="relative w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-[rgb(120,120,120)] flex items-center justify-center text-[rgb(190,190,190)] text-lg hover:border-[rgb(190,190,190)]">
              +
              <input
                type="color"
                class="absolute inset-0 opacity-0 cursor-pointer"
                value={userPrimaryColorHEX()}
                onInput={(event) => {
                  const rgb = hexToRgb(event.currentTarget.value);
                  if (rgb) setPrimaryColor(rgb.join(", "));
                }}
              />
            </label>
          </div>

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">Choisissez une couleur prédéfinie ou la vôtre avec le bouton "+".</p>
        </section>
      </div>

      <div class="h-[1px] w-full border-b border-b-[rgb(90,90,90)]" />

      <section class="p-4">
        <h3 class="text-[rgb(240,240,240)] text-[18px] mb-2">Zone dangereuse</h3>

        <button
          class="w-full text-center border border-red text-red hover:bg-red/10 active:bg-red/20 px-3 py-1 rounded-lg"
          type="button"
          onClick={async () => {
            await resetAppCache();
            window.location.reload();
          }}
        >
          Effacer le cache
        </button>
        <p class="text-[rgb(190,190,190)] text-xs mt-1.5">Supprime le cache stocké par l'application dans le navigateur.</p>
      </section>
    </Modal>
  );
};

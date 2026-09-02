import { For } from "solid-js";
import type { Component, Setter } from "solid-js";
import { Modal } from "~/components/modals";

import { DEFAULT_USER_CUSTOMIZATION, getUserCustomizationKey, preferences, setMainGroup, setSubGroup, setUserCustomization, textColorOnBG } from "~/stores/preferences";
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
  "230, 230, 230"
];

const SelectionButton: Component<{
  active: boolean,
  onClick: () => void,
  content: string
}> = (props) => (
  <button type="button"
    class={["w-full text-center rounded-lg px-4 py-1", props.active
      ? "bg-red font-medium"
      : "text-[rgb(120,120,120)] bg-[rgb(50,50,50)]"]}
    onClick={() => props.onClick()}
    style={props.active ? { color: textColorOnBG() } : void 0}
  >
    {props.content}
  </button>
);

const ToggleSwitch: Component<{
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void
}> = (props) => (
  <div class="flex items-center justify-between mt-2">
    <p class="mr-1.5 text-[rgb(220,220,220)] select-none">
      {props.label}
    </p>
    <button type="button" role="switch" aria-checked={props.checked ? "true" : "false"}
      class={["inline-flex items-center h-6 w-11 rounded-full px-.5 transition-colors", props.checked ? "bg-red" : "bg-[rgb(48,48,48)]"]}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class={["h-5 w-5 rounded-full bg-white transition-transform", props.checked && "transform translate-x-[calc(100%-1px)]"]} />
    </button>
  </div>
);

export const SettingsModal: Component<{ open: boolean, setOpen: Setter<boolean> }> = (props) => {
  const userPrimaryColor = () => getUserCustomizationKey("primary_color");
  const userPrimaryColorHEX = () => {
    const [r, g, b] = userPrimaryColor().split(",").map(Number);
    return rgbToHex(r, g, b);
  };

  const setPrimaryColor = (color: string) => {
    if (color === userPrimaryColor()) return;

    setUserCustomization({
      ...preferences.customization,
      primary_color: color
    });
  };

  return (
    <Modal title="Paramètres"
      open={props.open}
      onClose={() => props.setOpen(false)}
    >
      <div class="p-4 flex flex-col gap-6">
        <section>
          <h3 class="text-[rgb(240,240,240)] text-[18px] mb-2">
            Groupe principal
          </h3>
          <div class="flex">
            <button type="button"
              disabled={preferences.main_group <= 1}
              class="text-center border-2 border-red text-[rgb(220,220,220)] disabled:(bg-red text-transparent) px-4 py-1 border-r-none rounded-l-lg"
              onClick={() => {
                let value = preferences.main_group - 1;
                if (value === 6) value--;
                if (value < 1) return;

                setMainGroup(value);
              }}
            >
              -1
            </button>
            <p
              aria-label="Groupe principal"
              class="w-full text-center bg-red px-3 py-1 font-medium text-lg"
              style={{ color: textColorOnBG() }}
            >
              G{preferences.main_group}
            </p>
            <button type="button"
              disabled={preferences.main_group >= 8}
              class="text-center border-2 border-red text-[rgb(220,220,220)] disabled:(bg-red text-transparent) px-4 py-1 border-l-none rounded-r-lg"
              onClick={() => {
                let value = preferences.main_group + 1;
                if (value === 6) value++;
                if (value > 8) return;

                setMainGroup(value);
              }}
            >
              +1
            </button>
          </div>

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">
            Ajustez le groupe dans lequel vous êtes (ex.: G1, G2, …) <br />
            C'est avec le groupe qu'est déterminée l'année.
          </p>
        </section>

        <section>
          <h3 class="text-[rgb(240,240,240)] text-[18px] mb-2">
            Sous-groupe
          </h3>

          <div class="flex gap-2">
            <SelectionButton
              content="A"
              active={preferences.sub_group === 0}
              onClick={() => setSubGroup(0)}
            />
            <SelectionButton
              content="B"
              active={preferences.sub_group === 1}
              onClick={() => setSubGroup(1)}
            />
          </div>

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">
            Ajustez le sous-groupe dans lequel vous êtes (ex.: G{preferences.main_group}A ou G{preferences.main_group}B)
          </p>
        </section>

        <section>
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-[rgb(240,240,240)] text-[18px] flex">
              Couleur de l'interface
            </h3>
            <div
              class="w-4 h-4 rounded-full"
              style={{ "background-color": `rgb(${userPrimaryColor()})` }}
            ></div>
          </div>

          <div class="flex items-center flex-wrap gap-3">
            <For each={PRESET_COLORS}>
              {(color) => (
                <button type="button" aria-label={`Couleur ${color}`}
                  class={["w-8 h-8 rounded-full transition-transform hover:scale-110", userPrimaryColor() === color && "ring-2 ring-white ring-offset-2 ring-offset-[rgb(32,32,32)]"]}
                  style={{ "background-color": `rgb(${color})` }}
                  onClick={() => setPrimaryColor(color)}
                />
              )}
            </For>

            <label class="relative w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-[rgb(120,120,120)] flex items-center justify-center text-[rgb(190,190,190)] text-lg hover:border-[rgb(190,190,190)]">
              +
              <input type="color" class="absolute inset-0 opacity-0 cursor-pointer"
                value={userPrimaryColorHEX()}
                onInput={(event) => {
                  const rgb = hexToRgb(event.currentTarget.value);
                  if (rgb) setPrimaryColor(rgb.join(", "));
                }}
              />
            </label>
          </div>

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">
            Choisissez une couleur prédéfinie ou la vôtre avec le bouton "+".
          </p>
        </section>

        <section>
          <h3 class="text-[rgb(240,240,240)] text-[18px]">
            Vue de l'EDT
          </h3>

          <ToggleSwitch
            label="Alignement sur les heures"
            checked={getUserCustomizationKey("use_fixed_height")}
            onChange={(value) => setUserCustomization({
              ...preferences.customization,
              use_fixed_height: value
            })}
          />

          <p class="text-[rgb(190,190,190)] text-xs mt-1.5">
            Le positionnement des cours sur l'emploi du temps sera aligné sur les heures.
          </p>
        </section>
      </div>

      <div class="h-[1px] w-full border-b border-b-[rgb(90,90,90)]" />

      <section class="p-4">
        <h3 class="text-[rgb(240,240,240)] text-[18px] mb-2">
          Zone dangereuse
        </h3>

        <button class="w-full text-center border border-red text-red hover:bg-red/10 active:bg-red/20 px-3 py-1 rounded-lg"
          type="button"
          onClick={async () => {
            await resetAppCache();
            window.location.reload();
          }}
        >
          Effacer le cache
        </button>
        <p class="text-[rgb(190,190,190)] text-xs mt-1.5">
          Supprime le cache stocké par l'application dans le navigateur.
        </p>
      </section>
    </Modal>
  );
};

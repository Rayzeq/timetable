/* @refresh reload */
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "virtual:uno.css";

import { render } from "@solidjs/web";
import { createRouter, defineRoute } from "@solidjs/router";

import { createEffect, onSettled } from "solid-js";

import { getUserCustomizationKey } from "~/stores/preferences";

import UpdaterModal from "~/components/modals/Updater";
import LessonModal from "~/components/modals/Lesson";

import { initializeNowRefresh } from "~/stores/temporary";
import { rgbToHex } from "~/utils/colors";

import Home from "./routes/index";
import Error404 from "./routes/404";

// Synchronously set custom color on root before render to prevent monochrome flash on mobile
const initialColor = getUserCustomizationKey("primary_color");
document.documentElement.style.setProperty("--custom-color", `rgb(${initialColor})`);

const Router = createRouter({
  routes: [
    defineRoute({ path: "/", component: Home }),
    defineRoute({ path: "*404", component: Error404 })
  ]
});

render(() => {
  const primaryColor = () => getUserCustomizationKey("primary_color");
  const primaryColorHEX = () => primaryColor()
    .split(",")
    .map(i => Number(i)) as [r: number, g: number, b: number];

  onSettled(() => {
    initializeNowRefresh();
  });

  createEffect(() => [primaryColor(), primaryColorHEX()] as const, ([color, hex]) => {
    const root = document.documentElement;
    root.style.setProperty("--custom-color", `rgb(${color})`);

    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", rgbToHex(...hex));
  });

  return (
    <Router>
      {(props) => (
        <>
          <UpdaterModal />
          <LessonModal />

          {props.children}
        </>
      )}
    </Router>
  );
}, document.getElementById("root") as HTMLElement);

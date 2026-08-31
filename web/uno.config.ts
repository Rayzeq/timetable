import { defineConfig, presetWind3, transformerVariantGroup } from "unocss";

export default defineConfig({
  presets: [presetWind3()],
  transformers: [transformerVariantGroup()],

  theme: {
    colors: {
      red: "rgba(var(--custom-color), %alpha)"
    },

    breakpoints: {
      sm: "436px",
      tablet: "768px",
      "laptop-sm": "1024px",
      "laptop-lg": "1440px",
    },

    animation: {
      keyframes: {
        "scale-in": "{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}",
        "scale-out": "{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.96)}}"
      }
    }
  }
});

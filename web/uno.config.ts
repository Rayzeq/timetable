import { defineConfig, presetWind4, transformerVariantGroup } from "unocss";

export default defineConfig({
  presets: [presetWind4()],
  transformers: [transformerVariantGroup()],

  theme: {
    colors: {
      red: "var(--custom-color)"
    },

    breakpoint: {
      sm: "436px",
      tablet: "768px",
      "laptop-sm": "1024px",
      "laptop-lg": "1440px",
    },

    animation: {
      keyframes: {
        "scale-in": "{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}",
        "scale-out": "{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(0.96)}}"
      },
      durations: {
        "fade-in": "150ms",
        "fade-out": "150ms",
        "scale-in": "200ms",
        "scale-out": "200ms"
      },
      timingFns: {
        "fade-in": "ease-out",
        "fade-out": "ease-in",
        "scale-in": "ease-out",
        "scale-out": "ease-in"
      },
      // exits hold their last frame until the element is unmounted.
      properties: {
        "fade-out": { "animation-fill-mode": "forwards" },
        "scale-out": { "animation-fill-mode": "forwards" }
      }
    }
  },

  // enter and exit animations driven by the kobalte data attributes.
  shortcuts: {
    "animate-kb-fade": "data-[expanded]:animate-fade-in data-[closed]:animate-fade-out motion-reduce:animate-none!",
    "animate-kb-scale": "data-[expanded]:animate-scale-in data-[closed]:animate-scale-out motion-reduce:animate-none!"
  }
});

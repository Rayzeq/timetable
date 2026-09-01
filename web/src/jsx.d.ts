import type { JSX } from "@solidjs/web";

// swiper element web components.
declare module "@solidjs/web" {
  namespace JSX {
    interface IntrinsicElements {
      "swiper-container": Record<string, unknown>;
      "swiper-slide": Record<string, unknown>;
    }
  }
}

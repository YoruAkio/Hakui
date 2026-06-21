import type { HayaiApi } from "../preload";

declare global {
  interface Window {
    hayai: HayaiApi;
  }
}

export {};

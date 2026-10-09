"use client";

import { useSyncExternalStore } from "react";
import { aiSettingsVersion, keyStore, subscribeAiSettings } from "@/lib/ai/key-store";
import { DEFAULT_SETTINGS } from "@/lib/ai/models";
import type { AiSettings, Provider } from "@/lib/ai/types";

export interface AiSettingsState {
  /** false during server rendering and the first client render */
  ready: boolean;
  settings: AiSettings;
  keyLocation: Record<Provider, "session" | "device" | null>;
  /** true when the selected provider has a key */
  hasKey: boolean;
}

/**
 * Reactive view of the bring-your-own-key settings. The key itself is NOT
 * exposed here; it is read from storage only at the moment a call is made.
 */
export function useAiSettings(): AiSettingsState {
  const version = useSyncExternalStore(subscribeAiSettings, aiSettingsVersion, () => -1);
  if (version === -1) {
    return {
      ready: false,
      settings: DEFAULT_SETTINGS,
      keyLocation: { anthropic: null, openai: null },
      hasKey: false,
    };
  }
  const settings = keyStore.getSettings();
  const keyLocation = {
    anthropic: keyStore.keyLocation("anthropic"),
    openai: keyStore.keyLocation("openai"),
  };
  return {
    ready: true,
    settings,
    keyLocation,
    hasKey: keyLocation[settings.provider] !== null,
  };
}

/* A tiny global switch so any component can open the single settings dialog. */
let dialogOpen = false;
const listeners = new Set<() => void>();

export function setAiSettingsOpen(open: boolean) {
  dialogOpen = open;
  listeners.forEach((l) => l());
}

/*
 * The dialog has no Radix trigger (any button can open it through this store),
 * so Radix has nowhere to return focus on close and would drop it on <body>.
 * Remember what had focus when it opened, and its id: the "Add your API key"
 * button is replaced by "Propose settings" once a key is saved, and the
 * replacement keeps the same id.
 */
let opener: { element: HTMLElement; id: string } | null = null;

export function openAiSettings() {
  if (typeof document !== "undefined") {
    const el = document.activeElement;
    opener =
      el instanceof HTMLElement && el !== document.body
        ? { element: el, id: el.id }
        : null;
  }
  setAiSettingsOpen(true);
}

/**
 * Where focus should go when the dialog closes (null: leave it to the dialog).
 * A replacement that cannot take focus (the "Propose settings" button is
 * disabled until a scenario is typed) hands over to its panel, marked with
 * `data-ai-focus-fallback`.
 */
export function takeAiSettingsReturnFocus(): HTMLElement | null {
  const o = opener;
  opener = null;
  if (!o) return null;
  const target = o.element.isConnected
    ? o.element
    : o.id
      ? document.getElementById(o.id)
      : null;
  if (!target) return null;
  if (target.matches(":disabled"))
    return target.closest<HTMLElement>("[data-ai-focus-fallback]") ?? null;
  return target;
}

export function useAiSettingsOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => dialogOpen,
    () => false,
  );
}

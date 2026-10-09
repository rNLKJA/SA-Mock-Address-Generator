"use client";

import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  openAiSettings,
  setAiSettingsOpen,
  takeAiSettingsReturnFocus,
  useAiSettings,
  useAiSettingsOpen,
} from "@/hooks/use-ai-settings";
import { keyStore } from "@/lib/ai/key-store";
import {
  ANTHROPIC_MODELS,
  isValidModelId,
  PROVIDER_HOST,
  PROVIDER_LABEL,
} from "@/lib/ai/models";
import { containsSecret } from "@/lib/ai/redact";
import type { AiSettings, Provider } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/** Header button: opens the settings dialog; a dot shows when a key is set. */
export function AiSettingsButton() {
  const { ready, hasKey, settings } = useAiSettings();
  const label =
    ready && hasKey
      ? `AI settings (${PROVIDER_LABEL[settings.provider]} key set in this browser)`
      : "AI settings (optional, bring your own key)";
  return (
    <>
      <button
        type="button"
        onClick={openAiSettings}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={label}
        title={label}
      >
        <KeyRound className="size-4" aria-hidden />
        {ready && hasKey ? (
          <span
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-emerald-600 ring-2 ring-background dark:bg-emerald-400"
            aria-hidden
          />
        ) : null}
      </button>
      <AiSettingsDialog />
    </>
  );
}

function AiSettingsDialog() {
  const open = useAiSettingsOpen();
  return (
    <Dialog open={open} onOpenChange={setAiSettingsOpen}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          // back to the button that opened the dialog (WCAG 2.4.3), not the top of the page
          const target = takeAiSettingsReturnFocus();
          if (target) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        {open ? <SettingsForm onDone={() => setAiSettingsOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { settings, keyLocation } = useAiSettings();
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(keyLocation[settings.provider] === "device");
  const [message, setMessage] = useState<string | null>(null);
  const keyId = useId();
  const modelId = useId();
  const rememberId = useId();
  const provider = draft.provider;
  const stored = keyLocation[provider];
  const openaiModel = draft.openaiModel.trim();
  // the model box sits right above the key box: never save a pasted key as a "model"
  const modelError =
    provider !== "openai" || !openaiModel || isValidModelId(openaiModel)
      ? null
      : containsSecret(openaiModel, key.trim() || null)
        ? "This looks like an API key, not a model id. Paste the key in the key box below; it is not saved here."
        : "Use a model id such as gpt-5-mini: letters, digits, dots, colons, dashes or underscores, no spaces.";

  const save = () => {
    if (modelError) return;
    keyStore.setSettings({ ...draft, openaiModel: openaiModel || settings.openaiModel });
    if (key.trim()) keyStore.setKey(provider, key, remember);
    else if (stored && (stored === "device") !== remember) {
      // move the existing key between tab and device storage
      const existing = keyStore.getKey(provider);
      if (existing) keyStore.setKey(provider, existing, remember);
    }
    setKey("");
    onDone();
  };

  const forget = () => {
    keyStore.forgetKey(provider);
    setKey("");
    setMessage(`${PROVIDER_LABEL[provider]} key removed from this browser.`);
  };

  return (
    <form
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>AI settings</DialogTitle>
        <DialogDescription>
          Optional. Everything on this site works without AI. To use &ldquo;Describe a
          test scenario&rdquo; on the generator, add your own API key: it is sent only
          from your browser to {PROVIDER_HOST[provider]}, never to this site.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Provider</span>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="AI provider"
          className="w-fit"
          value={provider}
          onValueChange={(v) => {
            if (!v) return;
            const p = v as Provider;
            setDraft((d) => ({ ...d, provider: p }));
            setRemember(keyLocation[p] === "device");
            setMessage(null);
          }}
        >
          <ToggleGroupItem value="anthropic">Anthropic (default)</ToggleGroupItem>
          <ToggleGroupItem value="openai">OpenAI</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={modelId} className="text-sm font-medium">
          Model
        </label>
        {provider === "anthropic" ? (
          <select
            id={modelId}
            value={draft.anthropicModel}
            onChange={(e) => setDraft((d) => ({ ...d, anthropicModel: e.target.value }))}
            className={inputClass}
          >
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.note})
              </option>
            ))}
          </select>
        ) : (
          <input
            id={modelId}
            value={draft.openaiModel}
            onChange={(e) => setDraft((d) => ({ ...d, openaiModel: e.target.value }))}
            spellCheck={false}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            aria-invalid={modelError ? true : undefined}
            aria-describedby={`${modelId}-hint${modelError ? ` ${modelId}-error` : ""}`}
            className={cn(inputClass, "font-mono", modelError && "border-destructive")}
          />
        )}
        {provider === "openai" ? (
          <p id={`${modelId}-hint`} className="text-xs text-muted-foreground">
            Any Chat Completions model id that supports JSON-schema output.
          </p>
        ) : null}
        {modelError ? (
          <p id={`${modelId}-error`} role="alert" className="text-xs text-destructive">
            {modelError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={keyId} className="text-sm font-medium">
          {PROVIDER_LABEL[provider]} API key
        </label>
        <div className="relative">
          <input
            id={keyId}
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              stored
                ? "A key is saved. Paste a new one to replace it."
                : provider === "anthropic"
                  ? "sk-ant-..."
                  : "sk-..."
            }
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            className={cn(inputClass, "pr-10 font-mono")}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {stored === "device"
            ? "A key is remembered on this device (localStorage)."
            : stored === "session"
              ? "A key is saved for this browser tab only (sessionStorage)."
              : "No key saved for this provider."}
        </p>
        <label
          htmlFor={rememberId}
          className="mt-1 inline-flex items-center gap-2 text-sm"
        >
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[var(--primary)]"
          />
          Remember on this device
        </label>
      </div>

      <ul className="space-y-1.5 rounded-xl border bg-muted/50 p-3 text-xs leading-relaxed">
        {[
          "Kept in this browser only: sessionStorage by default, localStorage if you tick “remember”.",
          `Sent only in the request header to ${PROVIDER_HOST[provider]}; never to this site, never logged.`,
          "Every AI call is recorded, without the key, in an audit log stored in this browser.",
        ].map((t) => (
          <li key={t} className="flex gap-2">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400"
              aria-hidden
            />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="-mt-1 text-xs text-muted-foreground">
        Read the{" "}
        <Link
          href="/methods#ai-use"
          onClick={onDone}
          className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          AI use statement
        </Link>{" "}
        or open the{" "}
        <Link
          href="/ai-log"
          onClick={onDone}
          className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          AI audit log
        </Link>
        .
      </p>
      {message ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {message}
        </p>
      ) : null}

      <DialogFooter>
        {stored ? (
          <Button
            type="button"
            variant="destructive"
            onClick={forget}
            className="sm:mr-auto"
          >
            Forget key
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={modelError !== null} className="px-4">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

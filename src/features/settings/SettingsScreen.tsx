import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { SelectField, TextField } from "../../components/Field";
import { Toggle } from "../../components/Toggle";
import { useTranslation } from "../../lib/i18n";
import { normalizeLocale } from "../../lib/i18n";
import { getAppInfo } from "../../lib/platform";
import type { AppSettings, ThemePreference } from "../reminders/types";
import type { useReminders } from "../reminders/useReminders";
import { PopupAvatar } from "../reminder-popup/PopupAvatar";
import { playTone } from "../tones/audio";
import { isToneId, TONE_IDS, FALLBACK_TONE, type ToneId } from "../tones/tones";

interface SettingsScreenProps {
  data: ReturnType<typeof useReminders>;
}

/** Real settings screen wired 1:1 to persisted SQLite settings + autostart. */
export function SettingsScreen({ data }: SettingsScreenProps): JSX.Element {
  const { t } = useTranslation(data.settings?.language);
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [pending, setPending] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const savedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current !== null) {
        window.clearTimeout(savedTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (data.settings !== null && draft === null) {
      setDraft(data.settings);
    }
  }, [data.settings, draft]);

  // The login toggle applies immediately; keep the draft row in sync.
  useEffect(() => {
    const current = draft;
    const stored = data.settings;
    if (stored === null || current === null) {
      return;
    }
    if (stored.autostartEnabled !== current.autostartEnabled) {
      setDraft({ ...current, autostartEnabled: stored.autostartEnabled });
    }
  }, [data.settings, draft]);

  // Load finished without settings (plain browser, or backend error): say so
  // instead of spinning forever. The shared banner carries the details.
  if (data.settings === null && !data.loading) {
    return (
      <p className="t-body py-10 text-center text-muted" role="status">
        {t("settings.unavailable")}
      </p>
    );
  }

  if (draft === null || data.settings === null) {
    return (
      <p className="t-body py-10 text-center text-muted" role="status">
        {t("settings.loading")}
      </p>
    );
  }

  const dirty =
    draft.theme !== data.settings.theme ||
    draft.language !== data.settings.language ||
    draft.defaultTone !== data.settings.defaultTone ||
    draft.notificationsEnabled !== data.settings.notificationsEnabled ||
    draft.snoozeDuration !== data.settings.snoozeDuration ||
    draft.popupDurationSecs !== data.settings.popupDurationSecs ||
    draft.reducedMotion !== data.settings.reducedMotion ||
    draft.companionAvatar !== data.settings.companionAvatar ||
    draft.launchMinimized !== data.settings.launchMinimized;

  async function handleSave(): Promise<void> {
    setPending(true);
    try {
      if (await data.saveSettings(draft as AppSettings)) {
        setSavedFlash(true);
        if (savedTimer.current !== null) {
          window.clearTimeout(savedTimer.current);
        }
        savedTimer.current = window.setTimeout(() => setSavedFlash(false), 2500);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleLoginToggle(enabled: boolean): Promise<void> {
    const snapshot: AppSettings | null = draft;
    const actual = await data.setAutostartPref(enabled);
    if (actual !== null && snapshot !== null) {
      setDraft({ ...snapshot, autostartEnabled: actual });
    }
  }

  /** Downscales an uploaded image to at most 256px (PNG data URL) so the
   * database stays tiny. Rejects non-images and files over 5 MB. */
  function avatarFromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX = 256;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx === null) {
            throw new Error("no 2d context");
          }
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode failed"));
      };
      img.src = url;
    });
  }

  async function handleAvatarFile(file: File | undefined): Promise<void> {
    if (file === undefined) {
      return;
    }
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setAvatarError(t("settings.companionInvalid"));
      return;
    }
    try {
      const dataUrl = await avatarFromFile(file);
      setAvatarError(null);
      setDraft((prev) => (prev === null ? prev : { ...prev, companionAvatar: dataUrl }));
    } catch {
      setAvatarError(t("settings.companionInvalid"));
    }
  }

  const info = getAppInfo();
  const defaultToneValue: ToneId = isToneId(draft.defaultTone) ? draft.defaultTone : FALLBACK_TONE;

  return (
    <div>
      <h1 className="t-h1">{t("settings.title")}</h1>
      <p className="t-body mt-0.5 text-muted">{t("settings.subtitle")}</p>

      <div className="mt-5 flex flex-col gap-4">
        <Card title={t("settings.reminders")}>
          <div className="flex max-w-xs flex-col gap-4">
            <TextField
              id="settings-snooze"
              label={t("settings.defaultSnooze")}
              type="number"
              min={0}
              max={180}
              value={draft.snoozeDuration}
              onChange={(e) => setDraft({ ...draft, snoozeDuration: Number(e.target.value) })}
            />
            <TextField
              id="settings-popup-duration"
              label={t("settings.popupDuration")}
              type="number"
              min={5}
              max={600}
              value={draft.popupDurationSecs}
              onChange={(e) => setDraft({ ...draft, popupDurationSecs: Number(e.target.value) })}
            />
            <SelectField
              id="settings-default-tone"
              label={t("settings.defaultTone")}
              value={defaultToneValue}
              onChange={(e) => setDraft({ ...draft, defaultTone: e.target.value })}
            >
              {TONE_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`tone.${id}`)}
                </option>
              ))}
            </SelectField>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("settings.notifications")}</p>
                <p className="t-caption text-muted">{t("settings.notificationsHint")}</p>
              </div>
              <Toggle
                checked={draft.notificationsEnabled}
                label={t("settings.notifications")}
                onChange={(next) => setDraft({ ...draft, notificationsEnabled: next })}
              />
            </div>
          </div>
        </Card>

        <Card title={t("settings.tones")}>
          <p className="t-caption mb-3 text-muted">{t("settings.tonesHint")}</p>
          <fieldset>
            <legend className="sr-only">{t("settings.tones")}</legend>
            <div className="flex flex-col gap-1">
              {TONE_IDS.map((id) => (
                <div
                  key={id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    defaultToneValue === id ? "bg-accent-soft" : "hover:bg-raised"
                  }`}
                >
                  <input
                    type="radio"
                    id={`tone-${id}`}
                    name="default-tone"
                    checked={defaultToneValue === id}
                    onChange={() => setDraft({ ...draft, defaultTone: id })}
                  />
                  <label htmlFor={`tone-${id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm font-medium">{t(`tone.${id}`)}</span>
                    <span className="t-caption block text-muted">{t(`tone.${id}Hint`)}</span>
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() => void playTone(id)}
                    className="px-2.5 py-1 text-xs"
                    aria-label={`${t("settings.preview")} ${t(`tone.${id}`)}`}
                  >
                    ▶ {t("settings.preview")}
                  </Button>
                </div>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card title={t("settings.companion")}>
          <p className="t-caption mb-3 text-muted">{t("settings.companionHint")}</p>
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-end justify-center overflow-hidden rounded-2xl bg-nook"
              aria-hidden="true"
            >
              {draft.companionAvatar !== null ? (
                <img src={draft.companionAvatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <PopupAvatar className="h-[70px] w-auto" />
              )}
            </div>
            <div className="flex flex-col items-start gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold transition-colors hover:bg-raised">
                {t("settings.companionChoose")}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void handleAvatarFile(file);
                  }}
                />
              </label>
              {draft.companionAvatar !== null && (
                <Button
                  variant="ghost"
                  onClick={() => setDraft({ ...draft, companionAvatar: null })}
                  className="px-2.5 py-1 text-xs"
                >
                  {t("settings.companionRemove")}
                </Button>
              )}
            </div>
          </div>
          {avatarError !== null && (
            <p role="alert" className="t-caption mt-2 text-danger">
              {avatarError}
            </p>
          )}
        </Card>

        <Card title={t("settings.appearance")}>
          <div className="flex max-w-xs flex-col gap-4">
            <SelectField
              id="settings-theme"
              label={t("settings.theme")}
              value={draft.theme}
              onChange={(e) => setDraft({ ...draft, theme: e.target.value as ThemePreference })}
            >
              <option value="system">{t("settings.themeSystem")}</option>
              <option value="light">{t("settings.themeLight")}</option>
              <option value="dark">{t("settings.themeDark")}</option>
            </SelectField>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t("settings.reducedMotion")}</p>
                <p className="t-caption text-muted">{t("settings.reducedMotionHint")}</p>
              </div>
              <Toggle
                checked={draft.reducedMotion}
                label={t("settings.reducedMotion")}
                onChange={(next) => setDraft({ ...draft, reducedMotion: next })}
              />
            </div>
          </div>
        </Card>

        <Card title={t("settings.language")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("settings.languageCurrent")}</p>
              <p className="t-caption text-muted">{t("settings.languageHint")}</p>
            </div>
            <span className="rounded-full bg-raised px-3 py-1 text-xs font-semibold text-muted">
              {normalizeLocale(draft.language)}
            </span>
          </div>
        </Card>

        <Card title={t("settings.startup")}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("settings.login")}</p>
              <p className="t-caption text-muted">{t("settings.loginHint")}</p>
            </div>
            <Toggle
              checked={draft.autostartEnabled}
              label={t("settings.login")}
              onChange={(next) => void handleLoginToggle(next)}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("settings.launchMinimized")}</p>
              <p className="t-caption text-muted">{t("settings.launchMinimizedHint")}</p>
            </div>
            <Toggle
              checked={draft.launchMinimized}
              label={t("settings.launchMinimized")}
              onChange={(next) => setDraft({ ...draft, launchMinimized: next })}
            />
          </div>
        </Card>

        <Card title={t("settings.about")}>
          <p className="text-sm font-semibold">
            {info.name} <span className="font-normal text-muted">v{info.version}</span>
          </p>
          <p className="t-body mt-1 text-muted">
            {t("settings.aboutCopy")}
          </p>
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium">{t("settings.diagnostics")}</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt>{t("settings.diagBackend")}</dt>
              <dd>{info.backend}</dd>
              <dt>{t("settings.diagDesktop")}</dt>
              <dd className="capitalize">{data.platform?.desktop ?? "…"}</dd>
              <dt>{t("settings.diagDisplay")}</dt>
              <dd className="capitalize">{data.platform?.displayServer ?? "…"}</dd>
              <dt>{t("settings.diagScheduler")}</dt>
              <dd>{data.status?.schedulerRunning === true ? t("settings.schedulerRunning") : t("settings.schedulerStopped")}</dd>
            </dl>
          </details>
        </Card>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => void handleSave()} loading={pending} disabled={!dirty}>
            {t("settings.save")}
          </Button>
          {dirty && !pending && (
            <Button variant="ghost" onClick={() => setDraft(data.settings)}>
              {t("settings.discard")}
            </Button>
          )}
          {savedFlash && (
            <p role="status" className="text-sm font-medium text-success">
              {t("settings.saved")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

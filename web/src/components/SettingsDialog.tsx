import { useEffect, useState } from "react";
import { LanguageSelect } from "@/components/LanguageSelect";
import { SiteNameField } from "@/components/SiteNameField";
import { Modal } from "@/components/Modal";
import { PersonalizationSection } from "@/components/PersonalizationSection";
import { SecuritySection } from "@/components/SecuritySection";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { api, type MeResponse } from "@/lib/api";
import { useResetAllSettings } from "@/lib/use-reset-all-settings";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection = "general" | "security" | "personalization";

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const t = useT();
  const resetAllSettings = useResetAllSettings();
  const [section, setSection] = useState<SettingsSection>("general");
  const [authMode, setAuthMode] = useState<MeResponse["authMode"] | null>(null);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const settingsSections: Array<{
    id: SettingsSection;
    labelKey:
      | "header.settingsGeneral"
      | "header.settingsSecurity"
      | "header.personalization";
    visible: boolean;
  }> = [
    { id: "general", labelKey: "header.settingsGeneral", visible: true },
    {
      id: "security",
      labelKey: "header.settingsSecurity",
      visible: authMode === "basic",
    },
    { id: "personalization", labelKey: "header.personalization", visible: true },
  ];

  useEffect(() => {
    if (!open) return;

    setSection("general");
    setResetStep(0);
    setResetError(null);
    setAuthMode(null);

    let cancelled = false;
    void api
      .getMe()
      .then((response) => {
        if (!cancelled) setAuthMode(response.authMode);
      })
      .catch(() => {
        if (!cancelled) setAuthMode(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (section === "security" && authMode !== "basic") {
      setSection("general");
    }
  }, [authMode, section]);

  const handleReset = () => {
    setResetting(true);
    setResetError(null);
    void resetAllSettings()
      .then(() => {
        setResetStep(0);
      })
      .catch((err) => {
        setResetError(
          err instanceof Error ? err.message : t("settings.resetAllFailed"),
        );
      })
      .finally(() => {
        setResetting(false);
      });
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} className="max-w-2xl p-0">
      <div className="flex items-center border-b border-[var(--color-border)] px-6 py-4">
        <h2 className="text-lg font-semibold">{t("header.settings")}</h2>
      </div>

      <div className="flex min-h-[28rem]">
        <nav
          className="flex w-36 shrink-0 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-2"
          aria-label={t("header.settings")}
        >
          {settingsSections
            .filter((item) => item.visible)
            .map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "rounded px-3 py-2 text-left text-sm transition-colors",
                  section === item.id
                    ? "bg-[var(--color-card)] font-medium text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-foreground)]",
                )}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
          {section === "general" && (
            <section className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold">
                  {t("header.settingsGeneral")}
                </h3>
                <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  {t("header.settingsGeneralHint")}
                </p>
              </div>
              <SiteNameField />
              <LanguageSelect />

              <div className="border-t border-[var(--color-border)] pt-6">
                <h3 className="text-sm font-semibold">
                  {t("settings.resetAllTitle")}
                </h3>
                <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                  {t("settings.resetAllHint")}
                </p>

                {resetError && (
                  <p className="mt-3 text-sm text-[var(--color-destructive)]">
                    {resetError}
                  </p>
                )}

                {resetStep === 0 && (
                  <Button
                    className="mt-3"
                    variant="destructive"
                    onClick={() => setResetStep(1)}
                  >
                    {t("settings.resetAllAction")}
                  </Button>
                )}

                {resetStep === 1 && (
                  <div className="mt-3 space-y-3 rounded border border-[color-mix(in_oklch,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--color-destructive)_8%,transparent)] p-3">
                    <p className="text-sm">{t("settings.resetAllConfirm1")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="destructive"
                        disabled={resetting}
                        onClick={() => setResetStep(2)}
                      >
                        {t("settings.resetAllContinue")}
                      </Button>
                      <Button variant="secondary" onClick={() => setResetStep(0)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}

                {resetStep === 2 && (
                  <div className="mt-3 space-y-3 rounded border border-[color-mix(in_oklch,var(--color-destructive)_40%,transparent)] bg-[color-mix(in_oklch,var(--color-destructive)_12%,transparent)] p-3">
                    <p className="text-sm font-medium">
                      {t("settings.resetAllConfirm2")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={resetting}
                        variant="destructive"
                        onClick={handleReset}
                      >
                        {resetting
                          ? t("settings.resetAllResetting")
                          : t("settings.resetAllFinalAction")}
                      </Button>
                      <Button variant="secondary" onClick={() => setResetStep(0)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {section === "security" && authMode === "basic" && <SecuritySection />}

          {section === "personalization" && <PersonalizationSection />}
        </div>
      </div>

      <div className="flex justify-end border-t border-[var(--color-border)] px-6 py-4">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {t("common.close")}
        </Button>
      </div>
    </Modal>
  );
}

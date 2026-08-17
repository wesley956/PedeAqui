"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { saveUserGuideProgressAction } from "@/features/user-guide/actions";
import type { UserGuideStatus, UserGuideStep } from "@/features/user-guide/guide-model";
import styles from "./new-user-guide.module.css";

function clampStep(value: number, length: number) {
  return Math.min(Math.max(0, value), Math.max(0, length - 1));
}

export function NewUserGuide({
  initialStatus,
  initialStep,
  autoOpen,
  steps,
}: {
  initialStatus: UserGuideStatus;
  initialStep: number;
  autoOpen: boolean;
  steps: readonly UserGuideStep[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(autoOpen);
  const [runtimeStatus, setRuntimeStatus] = useState<UserGuideStatus>(initialStatus);
  const [stepIndex, setStepIndex] = useState(() => clampStep(initialStep, steps.length));
  const [syncError, setSyncError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const startedRef = useRef(false);
  const persistentRun = runtimeStatus === "not_started" || runtimeStatus === "in_progress";
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const progress = steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 100;

  function persist(status: "in_progress" | "skipped" | "completed", currentStep = stepIndex) {
    setRuntimeStatus(status);
    startTransition(async () => {
      try {
        await saveUserGuideProgressAction({ status, currentStep });
        setSyncError(false);
      } catch {
        setSyncError(true);
      }
    });
  }

  useEffect(() => {
    if (!autoOpen || !persistentRun || startedRef.current) return;
    startedRef.current = true;
    persist("in_progress", stepIndex);
    // The first persistence only marks the automatic run as started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, persistentRun]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (persistentRun) persist("skipped", stepIndex);
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex, persistentRun]);

  if (!current) return null;

  const closeGuide = () => {
    if (persistentRun) persist("skipped", stepIndex);
    setOpen(false);
  };

  const next = () => {
    if (isLast) {
      persist("completed", stepIndex);
      setOpen(false);
      return;
    }
    const nextStep = stepIndex + 1;
    setStepIndex(nextStep);
    if (persistentRun) persist("in_progress", nextStep);
  };

  const previous = () => {
    const previousStep = Math.max(0, stepIndex - 1);
    setStepIndex(previousStep);
    if (persistentRun) persist("in_progress", previousStep);
  };

  const openArea = () => {
    if (!current.href) return;
    if (persistentRun) persist("in_progress", stepIndex);
    router.push(current.href);
    setOpen(false);
  };

  const reopen = () => {
    setStepIndex(runtimeStatus === "completed" || runtimeStatus === "skipped" ? 0 : clampStep(stepIndex, steps.length));
    setOpen(true);
  };

  return (
    <>
      <button className={styles.trigger} type="button" onClick={reopen} aria-label={persistentRun && !isLast ? "Continuar guia do PedeAqui" : "Abrir guia do PedeAqui"}>
        <span className={styles.triggerIcon} aria-hidden>?</span>
        <span>{persistentRun && !open ? "Continuar guia" : "Guia"}</span>
      </button>

      {open ? (
        <div className={styles.backdrop} role="presentation">
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="user-guide-title" aria-describedby="user-guide-description">
            <div className={styles.topline}>
              <span className={styles.kicker}>GUIA RÁPIDO · {stepIndex + 1} DE {steps.length}</span>
              <button className={styles.close} type="button" onClick={closeGuide} aria-label="Fechar guia">×</button>
            </div>

            <div className={styles.progressTrack} aria-hidden>
              <span className={styles.progressBar} style={{ width: `${progress}%` }} />
            </div>

            <div className={styles.content}>
              <div className={styles.stepNumber} aria-hidden>{String(stepIndex + 1).padStart(2, "0")}</div>
              <div>
                <h2 id="user-guide-title">{current.title}</h2>
                <p id="user-guide-description">{current.description}</p>
              </div>
            </div>

            {current.href ? (
              <div className={styles.destination}>
                <div>
                  <span>Área relacionada</span>
                  <strong>{pathname === current.href ? "Você já está nesta área" : current.href}</strong>
                </div>
                <button className={styles.openArea} type="button" onClick={openArea}>{current.actionLabel ?? "Abrir área"}</button>
              </div>
            ) : null}

            {syncError ? <p className={styles.syncError} role="status">O guia continua funcionando, mas não conseguimos salvar este avanço agora.</p> : null}

            <div className={styles.footer}>
              <button className={styles.skip} type="button" onClick={closeGuide}>{persistentRun ? "Pular por agora" : "Fechar"}</button>
              <div className={styles.controls}>
                <button className={styles.secondary} type="button" onClick={previous} disabled={stepIndex === 0 || isPending}>Voltar</button>
                <button className={styles.primary} type="button" onClick={next} disabled={isPending}>{isLast ? "Concluir guia" : "Próximo"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

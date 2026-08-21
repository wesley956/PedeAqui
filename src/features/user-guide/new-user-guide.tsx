"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { saveUserGuideProgressAction } from "@/features/user-guide/actions";
import { guideProgress, type UserGuideStatus, type UserGuideStep } from "@/features/user-guide/guide-model";
import styles from "./new-user-guide.module.css";

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
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(autoOpen);
  const [runtimeStatus, setRuntimeStatus] = useState<UserGuideStatus>(initialStatus);
  const [syncError, setSyncError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const startedRef = useRef(false);
  const progress = useMemo(() => guideProgress(steps), [steps]);
  const tasks = useMemo(() => steps.filter((step) => step.id !== "welcome" && step.id !== "ready"), [steps]);
  const activeGuideId = searchParams.get("guia");
  const activeStep = activeGuideId ? steps.find((step) => step.id === activeGuideId) ?? null : null;
  const isSetupChecklist = progress.total > 0;
  const allDone = isSetupChecklist && progress.completed === progress.total;

  function persist(status: "in_progress" | "skipped" | "completed", currentStep = 0) {
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
    if (!autoOpen || startedRef.current) return;
    startedRef.current = true;
    persist("in_progress", Math.max(0, initialStep));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  useEffect(() => {
    if (!allDone || runtimeStatus === "completed") return;
    persist("completed", tasks.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (steps.length === 0) return null;

  const reopen = () => setOpen(true);
  const closeGuide = () => {
    if (runtimeStatus === "not_started" || runtimeStatus === "in_progress") persist("skipped", 0);
    setOpen(false);
  };

  const openTask = (step: UserGuideStep, index: number) => {
    if (!step.href) return;
    if (runtimeStatus !== "completed") persist("in_progress", index);
    const separator = step.href.includes("?") ? "&" : "?";
    router.push(`${step.href}${separator}guia=${encodeURIComponent(step.id)}`);
    setOpen(false);
  };

  const returnToChecklist = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("guia");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`);
    setOpen(true);
  };

  return (
    <>
      <button className={styles.trigger} type="button" onClick={reopen} aria-label="Abrir assistente do PedeAqui">
        <span className={styles.triggerIcon} aria-hidden>{allDone ? "✓" : "?"}</span>
        <span className={styles.triggerText}>
          <strong>{isSetupChecklist ? "Configuração" : "Guia"}</strong>
          {isSetupChecklist ? <small>{progress.completed}/{progress.total} pronto</small> : <small>Ajuda por área</small>}
        </span>
      </button>

      {activeStep && !open ? (
        <aside className={styles.coach} aria-live="polite">
          <div className={styles.coachTopline}>
            <span className={styles.kicker}>{activeStep.state === "done" ? "ETAPA CONCLUÍDA" : "FAÇA AGORA"}</span>
            <button className={styles.coachClose} type="button" onClick={returnToChecklist} aria-label="Fechar orientação">×</button>
          </div>
          <strong className={styles.coachTitle}>{activeStep.title}</strong>
          <p>{activeStep.description}</p>
          {activeStep.tip ? <div className={styles.tip}><span aria-hidden>💡</span><span>{activeStep.tip}</span></div> : null}
          {activeStep.completionLabel ? <div className={styles.detected} data-done={activeStep.state === "done"}>{activeStep.state === "done" ? "✓" : "○"} {activeStep.completionLabel}</div> : null}
          <div className={styles.coachActions}>
            <button className={styles.secondary} type="button" onClick={() => router.refresh()} disabled={isPending}>Verificar progresso</button>
            <button className={styles.primary} type="button" onClick={returnToChecklist}>Ver checklist</button>
          </div>
        </aside>
      ) : null}

      {open ? (
        <div className={styles.backdrop} role="presentation">
          <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="user-guide-title">
            <div className={styles.topline}>
              <span className={styles.kicker}>{isSetupChecklist ? "ASSISTENTE DE PRIMEIROS PASSOS" : "GUIA DA SUA FUNÇÃO"}</span>
              <button className={styles.close} type="button" onClick={closeGuide} aria-label="Fechar guia">×</button>
            </div>

            <div className={styles.hero}>
              <div>
                <h2 id="user-guide-title">{steps[0]?.title}</h2>
                <p>{steps[0]?.description}</p>
              </div>
              {isSetupChecklist ? (
                <div className={styles.score} aria-label={`${progress.percent}% da configuração concluída`}>
                  <strong>{progress.percent}%</strong>
                  <span>pronto</span>
                </div>
              ) : null}
            </div>

            {isSetupChecklist ? (
              <div className={styles.progressTrack} aria-hidden>
                <span className={styles.progressBar} style={{ width: `${progress.percent}%` }} />
              </div>
            ) : null}

            {allDone ? (
              <div className={styles.successBanner}>
                <strong>Base operacional pronta ✓</strong>
                <span>O PedeAqui detectou que todas as etapas principais desta configuração foram concluídas.</span>
              </div>
            ) : null}

            <div className={styles.checklist}>
              {tasks.map((step, index) => (
                <article className={styles.task} data-state={step.state} key={step.id}>
                  <div className={styles.stateIcon} aria-hidden>{step.state === "done" ? "✓" : step.state === "todo" ? String(index + 1) : "i"}</div>
                  <div className={styles.taskBody}>
                    <div className={styles.taskTitleRow}>
                      <strong>{step.title}</strong>
                      <span className={styles.stateLabel}>{step.state === "done" ? "Pronto" : step.state === "todo" ? "Pendente" : "Conhecer"}</span>
                    </div>
                    <p>{step.description}</p>
                    {step.completionLabel ? <small>{step.completionLabel}</small> : null}
                  </div>
                  {step.href ? (
                    <button className={step.state === "done" ? styles.secondary : styles.taskAction} type="button" onClick={() => openTask(step, index + 1)}>
                      {step.state === "done" ? "Revisar" : step.actionLabel ?? "Fazer agora"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>

            {syncError ? <p className={styles.syncError} role="status">O guia continua funcionando, mas não conseguimos salvar este avanço agora.</p> : null}

            <div className={styles.footer}>
              <button className={styles.skip} type="button" onClick={closeGuide}>{runtimeStatus === "completed" ? "Fechar" : "Fazer depois"}</button>
              <div className={styles.footerInfo}>
                <span>O progresso real é detectado automaticamente.</span>
                <button className={styles.secondary} type="button" onClick={() => router.refresh()} disabled={isPending}>Atualizar progresso</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

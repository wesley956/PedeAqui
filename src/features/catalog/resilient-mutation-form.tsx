"use client";

import { useRef, useState, useTransition, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type MutationResult = {
  ok: boolean;
  message: string;
};

type ResilientMutationFormProps = {
  action: (formData: FormData) => Promise<MutationResult>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  successReset?: boolean;
};

export function ResilientMutationForm({
  action,
  children,
  className,
  style,
  successReset = true,
}: ResilientMutationFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<MutationResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const formData = new FormData(event.currentTarget);
    setResult(null);

    startTransition(async () => {
      try {
        const nextResult = await action(formData);
        setResult(nextResult);
        if (nextResult.ok) {
          if (successReset) formRef.current?.reset();
          router.refresh();
        }
      } catch {
        setResult({
          ok: false,
          message: "Não foi possível concluir a operação agora. Seus dados foram mantidos; tente novamente.",
        });
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={className}
      style={style}
      aria-busy={isPending}
    >
      {result ? (
        <div
          role={result.ok ? "status" : "alert"}
          aria-live="polite"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "var(--surface-2)",
            fontSize: 14,
          }}
        >
          {result.message}
        </div>
      ) : null}
      {children}
      {isPending ? <span className="muted" role="status" aria-live="polite">Salvando…</span> : null}
    </form>
  );
}

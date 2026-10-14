import { Button } from "@/components/ui/button";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import styles from "@/app/(app)/cardapio/catalog-management.module.css";

type MutationResult = { ok: boolean; message: string };

/** Interruptor "Ativo/Disponível" igual ao da lista de Produtos: um toque pausa ou reativa. */
export function CatalogSwitch({ action, fields, on, label, actionLabel }: {
  action: (formData: FormData) => Promise<MutationResult>;
  fields: Record<string, string>;
  on: boolean;
  /** Texto curto ao lado do interruptor, ex.: "Ativa". */
  label: string;
  /** Nome acessível, ex.: "Pausar categoria: Bebidas". */
  actionLabel: string;
}) {
  return (
    <ResilientMutationForm action={action} className={styles.quickAvailabilityForm}>
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <Button type="submit" tone="secondary" role="switch" aria-checked={on} aria-label={actionLabel} className={styles.availabilitySwitch}>
        <span className={styles.switchTrack} aria-hidden="true" />{label}
      </Button>
    </ResilientMutationForm>
  );
}

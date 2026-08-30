"use client";

import Link from "next/link";
import { useActionState } from "react";
import { acceptSubscriptionContractAction, type AcceptSubscriptionContractState } from "@/features/subscription/actions";
import styles from "./assinatura.module.css";

const initialState: AcceptSubscriptionContractState = { status: "idle", message: "" };

export function ContractAcceptanceForm({ version }: { version: string }) {
  const [state, action, pending] = useActionState(acceptSubscriptionContractAction, initialState);
  return (
    <form action={action} className={styles.contractForm}>
      <div className={styles.contractFields}>
        <label>
          <span>Nome do responsável legal</span>
          <input name="representativeName" required minLength={2} autoComplete="name" placeholder="Nome completo" />
        </label>
        <label>
          <span>CPF/CNPJ do responsável <small>(opcional)</small></span>
          <input name="representativeDocument" inputMode="numeric" autoComplete="off" placeholder="Documento do responsável" />
        </label>
      </div>
      <label className={styles.contractCheck}>
        <input type="checkbox" name="accepted" required />
        <span>Li o <Link href="/assinatura/contrato">Contrato de Assinatura PedeAqui</Link> versão {version}, conferi as condições comerciais e declaro possuir poderes para representar a empresa.</span>
      </label>
      <div className={styles.contractActions}>
        <Link href="/assinatura/contrato" className={styles.secondaryLink}>Ver contrato completo</Link>
        <button type="submit" disabled={pending}>{pending ? "Formalizando..." : "Aceitar e formalizar contrato"}</button>
      </div>
      {state.message ? <p className={state.status === "error" ? styles.formError : styles.formSuccess}>{state.message}{state.protocol ? ` Protocolo: ${state.protocol}.` : ""}</p> : null}
    </form>
  );
}

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import styles from "./form-controls.module.css";

type FieldMeta = {
  label: string;
  hint?: string;
  error?: string;
  loading?: boolean;
};

function describedBy(id: string | undefined, hint?: string, error?: string) {
  return [hint && id ? `${id}-hint` : null, error && id ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldMeta & { id?: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={id} className={styles.field}>
      <span className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {required ? <span className={styles.required}>Obrigatório</span> : null}
      </span>
      {children}
      {error && id ? <small id={`${id}-error`} className={styles.error} role="alert">{error}</small> : null}
      {!error && hint && id ? <small id={`${id}-hint`} className={styles.hint}>{hint}</small> : null}
    </label>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldMeta;

export function Input({ label, hint, error, loading = false, id, name, className, disabled, required, ...props }: InputProps) {
  const inputId = id ?? name;
  const classes = [styles.control, error ? styles.invalid : null, className].filter(Boolean).join(" ");
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error} required={required}>
      <input
        {...props}
        id={inputId}
        name={name}
        required={required}
        disabled={disabled || loading}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        aria-busy={loading || undefined}
        className={classes}
      />
    </FieldShell>
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMeta;

export function Textarea({ label, hint, error, loading = false, id, name, className, disabled, required, ...props }: TextareaProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea
        {...props}
        id={fieldId}
        name={name}
        required={required}
        disabled={disabled || loading}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-busy={loading || undefined}
        className={[styles.control, styles.textarea, error ? styles.invalid : null, className].filter(Boolean).join(" ")}
      />
    </FieldShell>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & FieldMeta & { children: ReactNode };

export function SelectField({ label, hint, error, loading = false, id, name, className, disabled, required, children, ...props }: SelectFieldProps) {
  const fieldId = id ?? name;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <select
        {...props}
        id={fieldId}
        name={name}
        required={required}
        disabled={disabled || loading}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        aria-busy={loading || undefined}
        className={[styles.control, error ? styles.invalid : null, className].filter(Boolean).join(" ")}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  hint?: string;
};

function Choice({ type, label, hint, id, name, ...props }: ChoiceProps & { type: "checkbox" | "radio" }) {
  const fieldId = id ?? name;
  return (
    <label className={styles.choice} htmlFor={fieldId}>
      <input {...props} id={fieldId} name={name} type={type} />
      <span className={styles.choiceText}>
        <span>{label}</span>
        {hint ? <small className={styles.hint}>{hint}</small> : null}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) { return <Choice {...props} type="checkbox" />; }
export function Radio(props: ChoiceProps) { return <Choice {...props} type="radio" />; }

export function Switch({ label, hint, id, name, ...props }: ChoiceProps) {
  const fieldId = id ?? name;
  return (
    <label className={styles.choice} htmlFor={fieldId}>
      <span style={{ position: "relative", display: "inline-flex" }}>
        <input {...props} id={fieldId} name={name} type="checkbox" role="switch" className={styles.switchInput} />
        <span className={styles.switch} aria-hidden="true" />
      </span>
      <span className={styles.choiceText}>
        <span>{label}</span>
        {hint ? <small className={styles.hint}>{hint}</small> : null}
      </span>
    </label>
  );
}

export function SearchInput(props: Omit<InputProps, "type">) {
  return <Input {...props} type="search" inputMode="search" autoComplete="off" />;
}

export function MoneyInput(props: Omit<InputProps, "type" | "inputMode">) {
  return <Input {...props} type="text" inputMode="decimal" />;
}

export function PhoneInput(props: Omit<InputProps, "type" | "inputMode">) {
  return <Input {...props} type="tel" inputMode="tel" autoComplete={props.autoComplete ?? "tel"} />;
}

export function AddressInput(props: InputProps) {
  return <Input {...props} autoComplete={props.autoComplete ?? "street-address"} />;
}

export function QuantityInput({ className, min = 0, step = 1, ...props }: Omit<InputProps, "type" | "inputMode">) {
  return <Input {...props} min={min} step={step} type="number" inputMode="numeric" className={[styles.quantity, className].filter(Boolean).join(" ")} />;
}

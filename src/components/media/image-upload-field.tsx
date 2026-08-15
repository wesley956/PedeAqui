"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./image-upload-field.module.css";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPT = "image/jpeg,image/png,image/webp";

export function ImageUploadField({
  name,
  label,
  currentUrl = null,
  removeName,
  hint = "JPEG, PNG ou WebP, até 5 MB.",
}: {
  name: string;
  label: string;
  currentUrl?: string | null;
  removeName?: string;
  hint?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function clearObjectPreview() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      event.target.value = "";
      setError("Escolha uma imagem JPEG, PNG ou WebP.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      event.target.value = "";
      setError("A imagem deve ter no máximo 5 MB.");
      return;
    }

    clearObjectPreview();
    const nextObjectUrl = URL.createObjectURL(file);
    setObjectUrl(nextObjectUrl);
    setPreviewUrl(nextObjectUrl);
    setFileName(file.name);
    setRemoved(false);
  }

  function removeImage() {
    clearObjectPreview();
    if (inputRef.current) inputRef.current.value = "";
    setPreviewUrl(null);
    setFileName(null);
    setRemoved(true);
    setError(null);
  }

  const hasImage = Boolean(previewUrl);

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>{label}</label>
        {hasImage ? <span className={styles.ready}>Imagem selecionada</span> : null}
      </div>

      <div className={styles.picker}>
        <div className={`${styles.preview} ${hasImage ? styles.previewFilled : ""}`} aria-live="polite">
          {previewUrl ? (
            // Blob previews and tenant media are intentionally rendered without the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={`Prévia de ${label.toLowerCase()}`} />
          ) : (
            <div className={styles.emptyPreview} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <circle cx="9" cy="10" r="2" />
                <path d="m5 18 4.5-4.5 3.2 3.2 2.3-2.3L19 18" />
              </svg>
              <span>Sem imagem</span>
            </div>
          )}
        </div>

        <div className={styles.controls}>
          <input
            ref={inputRef}
            id={id}
            className={styles.fileInput}
            type="file"
            name={name}
            accept={ACCEPT}
            onChange={handleFileChange}
          />
          <label className={styles.chooseButton} htmlFor={id}>
            {hasImage ? "Trocar imagem" : "Escolher imagem"}
          </label>
          {hasImage ? (
            <button className={styles.removeButton} type="button" onClick={removeImage}>Remover</button>
          ) : null}
          <span className={styles.hint}>{fileName ? `Selecionada: ${fileName}` : hint}</span>
          {error ? <span className={styles.error} role="alert">{error}</span> : null}
        </div>
      </div>

      {removeName ? <input type="hidden" name={removeName} value={removed ? "on" : ""} /> : null}
    </div>
  );
}

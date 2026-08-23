"use client";

import { useState } from "react";

type Props = {
  defaultChangeFor?: string;
  inputClassName: string;
  fieldClassName: string;
  choicesClassName: string;
  choiceClassName: string;
  selectedClassName: string;
};

export function CashChangeFields({ defaultChangeFor = "", inputClassName, fieldClassName, choicesClassName, choiceClassName, selectedClassName }: Props) {
  const [needsChange, setNeedsChange] = useState(Boolean(defaultChangeFor));

  return <div className={fieldClassName}>
    <span>Precisa de troco?</span>
    <div className={choicesClassName} role="radiogroup" aria-label="Precisa de troco?">
      <label className={`${choiceClassName} ${!needsChange ? selectedClassName : ""}`}>
        <span><input type="radio" name="needsChange" value="no" checked={!needsChange} onChange={() => setNeedsChange(false)} /> <strong>Não</strong></span>
      </label>
      <label className={`${choiceClassName} ${needsChange ? selectedClassName : ""}`}>
        <span><input type="radio" name="needsChange" value="yes" checked={needsChange} onChange={() => setNeedsChange(true)} /> <strong>Sim</strong></span>
      </label>
    </div>
    {needsChange ? <label className={fieldClassName}><span>Troco para quanto?</span><input className={inputClassName} name="changeFor" inputMode="decimal" defaultValue={defaultChangeFor} placeholder="Ex.: 100,00" required /></label> : <input type="hidden" name="changeFor" value="" />}
  </div>;
}

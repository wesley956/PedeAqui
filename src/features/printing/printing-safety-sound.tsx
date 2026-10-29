"use client";

import { useEffect, useRef, useState } from "react";

function tone(context: AudioContext) {
  const start = context.currentTime;
  for (const [offset, frequency] of [[0, 660], [0.25, 440]] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + offset);
    gain.gain.linearRampToValueAtTime(0.12, start + offset + 0.02);
    gain.gain.linearRampToValueAtTime(0, start + offset + 0.2);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start + offset); oscillator.stop(start + offset + 0.21);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}

/** User-enabled, distinct from the new-order sound; one alert per incident change. */
export function PrintingSafetySound({ incidentKey }: { incidentKey: string }) {
  const context = useRef<AudioContext | null>(null);
  const last = useRef("");
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => { void context.current?.close(); }, []);
  useEffect(() => {
    if (!incidentKey) { last.current = ""; return; }
    if (!enabled || !context.current || incidentKey === last.current) return;
    last.current = incidentKey;
    const audio = context.current;
    let active = true;
    void audio.resume().then(() => { if (active) tone(audio); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [incidentKey, enabled]);
  const toggle = async () => {
    if (enabled) { setEnabled(false); return; }
    try {
      const audio = context.current ?? new AudioContext();
      context.current = audio;
      await audio.resume();
      // A test tone confirms the browser allowed playback after this click.
      tone(audio);
      last.current = incidentKey;
      setFailed(false); setEnabled(true);
    } catch { setFailed(true); }
  };
  return <div>
    <button type="button" aria-pressed={enabled} onClick={() => void toggle()}>{enabled ? "Desativar som de falha de impressão" : "Ativar e testar som de falha de impressão"}</button>
    <p>{failed ? "O navegador bloqueou o som. Os avisos visuais continuam disponíveis." : "O som avisa uma vez por mudança de falha, enquanto este painel estiver aberto. O aviso visual permanece até a próxima conferência confirmar a recuperação."}</p>
  </div>;
}

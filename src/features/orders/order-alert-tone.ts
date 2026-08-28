const ORDER_ALERT_STORAGE_KEY = "pedeaqui:orders:sound-enabled";
const ORDER_ALERT_AUDIO_PATH = "/audio/pedeaqui-pedido.mp3";

export function createOrderAlertAudio() {
  const audio = new Audio(ORDER_ALERT_AUDIO_PATH);
  audio.preload = "auto";
  audio.volume = 1;
  return audio;
}

export function readOrderAlertPreference() {
  try {
    return window.localStorage.getItem(ORDER_ALERT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeOrderAlertPreference(enabled: boolean) {
  try {
    window.localStorage.setItem(ORDER_ALERT_STORAGE_KEY, String(enabled));
  } catch {
    // O armazenamento pode estar indisponível em navegação privada; o estado da sessão continua funcionando.
  }
}

export async function playOrderAlertTone(audio: HTMLAudioElement) {
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = 1;
  await audio.play();
}

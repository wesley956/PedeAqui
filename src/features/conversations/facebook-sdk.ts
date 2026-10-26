export type FacebookSdk = {
  init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>): void;
  __buffer?: unknown;
};
declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: (() => void) & { hasRun?: boolean }; }
}

let sdkPromise: Promise<FacebookSdk> | null = null;
let initialized: { sdk: FacebookSdk; appId: string; version: string } | null = null;

export function initializeFacebookSdk(appId: string, version: string): FacebookSdk {
  const sdk = window.FB;
  if (!/^[0-9]{1,21}$/.test(appId) || !/^v[0-9]+\.0$/.test(version)) {
    throw new Error("Configuração da conexão Meta inválida.");
  }
  if (!sdk?.init || !sdk.login || sdk.__buffer) throw new Error("A conexão segura ainda está sendo preparada.");
  if (initialized?.sdk !== sdk || initialized.appId !== appId || initialized.version !== version) {
    sdk.init({ appId, cookie: true, xfbml: false, version });
    initialized = { sdk, appId, version };
  }
  return sdk;
}

export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  if (window.FB && !window.FB.__buffer) {
    try { return Promise.resolve(initializeFacebookSdk(appId, version)); }
    catch (error) { return Promise.reject(error); }
  }
  if (sdkPromise) return sdkPromise.then(() => initializeFacebookSdk(appId, version));
  const loading = new Promise<FacebookSdk>((resolve, reject) => {
    let settled = false;
    const previous = window.fbAsyncInit;
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    const timer = window.setTimeout(() => fail(), 20_000);
    function cleanup() {
      window.clearTimeout(timer);
      script.removeEventListener("load", finish);
      script.removeEventListener("error", fail);
      if (window.fbAsyncInit === onReady) window.fbAsyncInit = previous;
    }
    function fail() {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Não foi possível carregar a conexão segura do WhatsApp. Atualize a página e tente novamente."));
    }
    function finish() {
      // sdk.js first exposes a buffered facade and loads a second bundle.
      // Its load event is not proof that the real SDK is ready.
      if (settled || !window.FB || window.FB.__buffer) return;
      try {
        const sdk = initializeFacebookSdk(appId, version);
        settled = true;
        cleanup();
        resolve(sdk);
      } catch { fail(); }
    }
    function onReady() {
      try { previous?.(); } finally { finish(); }
    }
    window.fbAsyncInit = onReady;
    script.addEventListener("load", finish);
    script.addEventListener("error", fail);
    if (!existing) {
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }
    finish();
  });
  sdkPromise = loading;
  void loading.catch(() => { if (sdkPromise === loading) sdkPromise = null; });
  return loading;
}

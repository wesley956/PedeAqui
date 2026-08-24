import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const client = read("src/features/conversations/meta-embedded-signup-card.tsx");
const actions = read("src/features/conversations/meta-embedded-signup-actions.ts");

describe("Meta Embedded Signup popup flow", () => {
  it("preloads the public Meta browser config and SDK before the restaurant clicks", () => {
    expect(client).toContain("useEffect");
    expect(client).toContain("getWhatsAppEmbeddedSignupBrowserConfigAction()");
    expect(client).toContain("loadFacebookSdk(config.appId, config.graphVersion)");
    expect(client).toContain("Preparando a conexão segura com o WhatsApp");
    expect(actions).toContain("META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID");
    expect(actions).toContain("META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION");
  });

  it("launches FB.login directly from the click before starting the server session", () => {
    const loginCall = client.indexOf("const codePromise = loginWithEmbeddedSignup");
    const sessionCall = client.indexOf("const sessionPromise = startWhatsAppEmbeddedSignupAction");
    expect(loginCall).toBeGreaterThan(-1);
    expect(sessionCall).toBeGreaterThan(loginCall);
    expect(client).toContain("FB.login must be invoked directly from the user's click");
  });

  it("does not leave the UI waiting indefinitely when Meta returns a code without session info", () => {
    expect(client).toContain("waitForMetaResultAfterLogin");
    expect(client).toContain("12_000");
    expect(client).toContain("A Meta autorizou o login, mas não concluiu a etapa do WhatsApp");
  });
});

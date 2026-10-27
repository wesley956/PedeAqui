import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const repo = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), "pedeaqui-reliability-"));
const evidence = path.join(repo, "artifacts/browser-homologation/reliability-1291");
await mkdir(evidence, { recursive: true });
let server;
let browser;
const results = [];
try {
  await symlink(path.join(repo, "node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, "index.html"), '<div id="root"></div><script type="module" src="/main.jsx"></script>');
  await writeFile(path.join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx", target: "ES2022" } }));
  await writeFile(path.join(directory, "main.jsx"), "import React, {useState} from \"react\";\nimport {createRoot} from \"react-dom/client\";\nimport {ExpressCheckoutForm} from \"@/features/checkout/express-checkout-form\";\nimport {OperationalHealthIndicator} from \"@/features/operations/operational-health-indicator\";\nconst defaults={fulfillment:\"delivery\", name:\"Cliente Teste\",phone:\"19999999999\",email:\"\",neighborhoodId:\"n1\",postalCode:\"\",street:\"Rua Teste\",number:\"10\",complement:\"\",district:\"Centro\",city:\"Nova Odessa\",state:\"SP\",reference:\"\",paymentValue:\"cash\",changeFor:\"\",scheduledLocal:\"\"};\nconst props={slug:\"loja-teste\",canOrder:true,closedMessage:null,allowDelivery:true,allowPickup:true,allowScheduling:false,deliveryEta:\"30–45 min\",useNeighborhoods:true,neighborhoods:[{id:\"n1\",neighborhoodName:\"Centro\",city:\"Nova Odessa\",state:\"SP\",feeCents:300,minimumOrderCents:null}],storeCity:\"Nova Odessa\",storeState:\"SP\",returningName:null,defaults,items:[{id:\"i1\",productId:\"p1\",name:\"Pastel de queijo\",imageUrl:null,quantity:1,lineTotalCents:2500,details:\"\",editable:false}],savedAddresses:[],paymentMethods:[{value:\"cash\",method:\"cash\",label:\"Dinheiro\",help:\"Na entrega\"}],benefits:null,minimumOrderCents:0,minimumMissingCents:0,error:null};\nfunction App(){const [reviewed,setReviewed]=useState(false);window.fixtureSubmit=()=>setReviewed(true);return <><OperationalHealthIndicator storeId=\"store-a\" canMonitorPrinting snapshot={{checkedAt:new Date().toISOString(),printingConfigured:true,issues:[]}}/><ExpressCheckoutForm {...props} totals={{subtotalCents:2500,discountCents:0,deliveryFeeCents:reviewed?300:0,totalCents:reviewed?2800:2500,quotedDelivery:reviewed}} error={reviewed?{block:\"resumo\",message:\"Seu pedido ainda não foi enviado. Confira os valores e confirme.\"}:null}/></>}\ncreateRoot(document.getElementById(\"root\")).render(<App/>);\n");
  const mocks = {
    "/src/features/checkout/express-actions.ts": "export async function submitExpressCheckoutAction(data){window.fixtureSubmit(data)};export async function expressItemAction(){};export async function expressApplyBenefitsAction(){};export async function expressClearBenefitsAction(){}",
    "/src/features/printing/actions.ts": "export async function recognizePrintedJobAction(){};export async function retryPrintJobAction(){}",
    "/src/lib/supabase/client.ts": "export function createClient(){return {channel(){const x={on(){return x},subscribe(fn){fn('SUBSCRIBED');return x}};return x},removeChannel(){}}}",
    "next/link": "import React from 'react';export default function Link(props){const {children,scroll,...rest}=props;void scroll;return React.createElement('a',rest,children)}",
  };
  server = await createServer({
    configFile: false, root: directory,
    resolve: { alias: { "@": path.join(repo, "src"), react: path.join(repo, "node_modules/react"), "react-dom": path.join(repo, "node_modules/react-dom") } },
    server: { host: "127.0.0.1", port: 4173, strictPort: true, fs: { allow: [repo, directory] } },
    plugins: [{
      name: "isolated-order-print-actions", enforce: "pre",
      resolveId(id) {
        for (const key of Object.keys(mocks)) if (id === key || id.endsWith(key) || id.endsWith(key.replace(/\.ts$/, ""))) return "\0fixture" + key;
      },
      load(id) { if (id.startsWith("\0fixture")) return mocks[id.slice(8)]; },
    }],
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1366]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let issues = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4173") return route.abort();
      if (url.pathname === "/api/printing/health") return route.fulfill({ json: { storeId: "store-a", checkedAt: new Date().toISOString(), issues } });
      return route.continue();
    });
    await page.goto("http://127.0.0.1:4173");
    const calculate = page.getByRole("button", { name: "Calcular total e revisar antes de enviar", exact: true });
    await calculate.waitFor({ timeout: 20_000 });
    await page.locator('input[name="name"]').fill("Cliente Mantido");
    await calculate.click();
    await page.getByRole("button", { name: "Confirmar pedido · R$ 28,00", exact: true }).waitFor();
    assert.equal(await page.locator('input[name="name"]').inputValue(), "Cliente Mantido");
    issues = [{ id: "printing-destination-unavailable", area: "printing", origin: "local_equipment", severity: "P0", title: "Confira a impressão dos pedidos", cause: "Agente sem comunicação", impact: "Há pedidos aguardando.", action: "Confira a Epson e abra Impressões." }];
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByText("Impressão precisa de atenção", { exact: false }).waitFor();
    await page.locator("details.operational-health summary").first().click();
    await page.getByRole("button", { name: "Ativar e testar som de falha de impressão" }).click();
    await page.getByRole("button", { name: "Desativar som de falha de impressão" }).waitFor();
    await page.screenshot({ path: path.join(evidence, `checkout-print-${width}.png`), fullPage: true });
    issues = [];
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByText("Operação saudável", { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    results.push({ width, checkoutReview: true, identityPreserved: true, printWarning: true, recovery: true, soundOptIn: true, pageErrors: errors });
    await page.close();
  }
  await writeFile(path.join(evidence, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  await rm(directory, { recursive: true, force: true });
}

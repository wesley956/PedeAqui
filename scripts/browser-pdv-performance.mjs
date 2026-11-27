import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, symlink, rm, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const repo = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), "pedeaqui-pdv-1356-"));
const evidence = path.join(repo, "artifacts/pdv-1356");
await mkdir(evidence, { recursive: true });
let server, browser;
try {
  await copyFile("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", path.join(directory,"qa-font.ttf"));
  await symlink(path.join(repo, "node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, "index.html"), '<style>@font-face{font-family:Inter;src:url(/qa-font.ttf);font-weight:100 900}</style><div id="root"></div><script type="module" src="/main.jsx"></script>');
  await writeFile(path.join(directory, "main.jsx"), `import React from 'react';import {createRoot} from 'react-dom/client';import {PosShell} from '@/features/pdv/pos-shell';import {HumanAttentionAlert} from '@/features/conversations/human-attention-alert';import '@/app/globals.css';window.sales=[];window.refreshes=0;createRoot(document.getElementById('root')).render(<><HumanAttentionAlert storeId="76000000-0000-4000-8000-000000000002" alert={{count:0,firstConversationId:null}}/><PosShell categories={[]} products={Array.from({length:250},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),categoryId:null,name:'Produto '+i,description:null,sku:null,barcode:null,priceCents:1500,modifierGroups:[]}))} customerSearchEnabled paymentMethods={['cash','pix','credit_card','debit_card'].map(method=>({method,label:method==='cash'?'Dinheiro':method==='pix'?'Pix':method==='credit_card'?'Cartão de crédito':'Cartão de débito'}))} coupons={[]} growthSettings={{cashbackEnabled:false,loyaltyEnabled:false,loyaltyRedeemCentsPerPoint:1}} sessionNonce="fixture-1356"/></>);`);
  const legacy = execFileSync("git", ["show", "5927384:src/features/conversations/human-attention-alert.tsx"], { encoding: "utf8" }).replace('"./human-attention-alert.module.css"', '"@/features/conversations/human-attention-alert.module.css"');
  await writeFile(path.join(directory, "legacy.tsx"), legacy);
  await writeFile(path.join(directory, "baseline.html"), '<div id="root"></div><script type="module" src="/baseline.jsx"></script>');
  await writeFile(path.join(directory, "baseline.jsx"), `import React from 'react';import {createRoot} from 'react-dom/client';import {HumanAttentionAlert} from './legacy';window.refreshes=0;createRoot(document.getElementById('root')).render(<HumanAttentionAlert storeId="76000000-0000-4000-8000-000000000002" alert={{count:0,firstConversationId:null}}/>);`);
  const mocks = {
    "/src/features/pdv/actions.ts": `export async function searchPdvCustomersAction(){return {customers:[],error:null}};export async function createPdvSaleAction(input,key){window.sales.push({input,key});await new Promise(r=>setTimeout(r,400));return {ok:true,sale:{orderId:'sale-'+window.sales.length,displayNumber:window.sales.length,totalCents:input.items.reduce((s,i)=>s+i.quantity*1500,0),changeDueCents:0,created:true}}}`,
    "/src/lib/supabase/client.ts": `export function createClient(){return {channel(){const x={on(_e,_f,fn){window.conversationChanged=fn;return x},subscribe(fn){window.subscriptionStatus=fn;fn('SUBSCRIBED');return x}};return x},removeChannel(){window.channelRemoved=true}}}`,
    "next/navigation": `export function useRouter(){return {refresh(){window.refreshes++}}}`,
    "next/link": `import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,
    "next/image": `import React from 'react';export default function Image({unoptimized,...props}){return React.createElement('img',props)}`,
  };
  server = await createServer({ configFile:false,root:directory,esbuild:{jsx:"automatic"}, resolve:{alias:{"@":path.join(repo,"src"),react:path.join(repo,"node_modules/react"),"react-dom":path.join(repo,"node_modules/react-dom")}}, server:{host:"127.0.0.1",port:4176,strictPort:true,fs:{allow:[repo,directory]}},plugins:[{name:"isolated-pdv",enforce:"pre",resolveId(id){for(const key of Object.keys(mocks))if(id===key||id.endsWith(key)||id.endsWith(key.replace(/\.ts$/,"")))return "\0fixture"+key},load(id){if(id.startsWith("\0fixture"))return mocks[id.slice(8)]}}] });
  await server.listen();browser=await chromium.launch({headless:true});
  const results=[];
  for(const width of [390,1366]){
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let count=0, requests=0, active=0, maxActive=0, delay=0;
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://127.0.0.1:4176')return route.abort();if(url.pathname==='/api/conversations/human-attention'){requests++;active++;maxActive=Math.max(active,maxActive);if(delay)await new Promise(r=>setTimeout(r,delay));active--;return route.fulfill({json:{storeId:'76000000-0000-4000-8000-000000000002',alert:{count,firstConversationId:count?'test-conversation':null}}})}return route.continue()});
    await page.goto('http://127.0.0.1:4176/baseline.html');await page.waitForFunction(()=>typeof window.conversationChanged==='function');
    for(let i=0;i<5;i++){await page.evaluate(()=>window.conversationChanged());await page.waitForTimeout(220);}
    const baselineRefreshes=await page.evaluate(()=>window.refreshes);assert.equal(baselineRefreshes,5);
    await page.goto('http://127.0.0.1:4176');await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:'Produto 0',exact:false}).first().waitFor();
    await page.waitForFunction(()=>typeof window.conversationChanged==='function');
    await page.getByRole('button',{name:'Produto 0',exact:false}).first().click();
    count=2;delay=500;
    await page.evaluate(()=>{for(let i=0;i<200;i++)window.conversationChanged();});
    await page.getByText('2 clientes estão aguardando atendimento humano').waitFor({state:'attached'});
    assert.equal(await page.evaluate(()=>window.refreshes),0);assert.ok(requests<=3,`burst requests ${requests}`);assert.equal(maxActive,1);
    // A second burst while the first snapshot is pending must reconcile without overlaps.
    count=3;await page.evaluate(()=>window.conversationChanged());await page.waitForTimeout(300);await page.evaluate(()=>window.conversationChanged());
    await page.getByText('3 clientes estão aguardando atendimento humano').waitFor({state:'attached'});
    assert.equal(maxActive,1);
    if(width<820)await page.getByRole('button',{name:/Venda ·/}).click();
    await page.locator('[data-pdv-panel="sale"]').getByText('Produto 0',{exact:true}).waitFor({state:process.env.PDV_BROWSER_DOM_ONLY ? 'attached' : 'visible'});
    await page.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()});await page.getByText('finalizada em',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>window.sales.length),1);
    const timings=[];
    for(let i=0;i<20;i++){
      const elapsed=await page.evaluate(async()=>{const t=performance.now();window.conversationChanged();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-t;});timings.push(elapsed);
    }
    timings.sort((a,b)=>a-b);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(evidence,`pdv-${width}.png`),fullPage:true});
    results.push({width,domOnly:!!process.env.PDV_BROWSER_DOM_ONLY,baselineFullPageRefreshes:baselineRefreshes,products:250,burstEvents:200,fullPageRefreshes:await page.evaluate(()=>window.refreshes),maxConcurrentSnapshots:maxActive,sales:await page.evaluate(()=>window.sales.length),frameLatencyMs:{p50:timings[9],p95:timings[18],p99:timings[19]},pageErrors:errors});await page.close();
  }
  await writeFile(path.join(evidence,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await server?.close();await rm(directory,{recursive:true,force:true});}

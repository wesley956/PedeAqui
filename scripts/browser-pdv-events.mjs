import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const repo=process.cwd(),directory=await mkdtemp(path.join(tmpdir(),'pdv-events-browser-'));
const evidence=path.join(repo,'artifacts/pdv-1355');await mkdir(evidence,{recursive:true});
let server,browser;
const results=[];
try{
 await symlink(path.join(repo,'node_modules'),path.join(directory,'node_modules'),'dir');
 await copyFile('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',path.join(directory,'qa-font.ttf'));
 await writeFile(path.join(directory,'index.html'),'<style>@font-face{font-family:Inter;src:url(/qa-font.ttf)}</style><div id="root"></div><script type="module" src="/main.jsx"></script>');
 await writeFile(path.join(directory,'main.jsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import {PdvWorkspace} from '@/features/pdv/events/pdv-workspace';import '@/app/globals.css';window.eventState={events:[],operations:{},sales:[],createKeys:[],dropCreateResponse:true};createRoot(document.getElementById('root')).render(<div style={{height:'calc(100dvh - 32px)',padding:16}}><PdvWorkspace categories={[]} products={[{id:'86000000-0000-4000-8000-000000000004',categoryId:null,name:'Pizza no cone',description:'Produto final',sku:null,barcode:null,priceCents:1500,modifierGroups:[]}]} customerSearchEnabled={false} paymentMethods={[{method:'pix',label:'Pix'},{method:'cash',label:'Dinheiro'}]} coupons={[]} growthSettings={{cashbackEnabled:false,loyaltyEnabled:false,loyaltyRedeemCentsPerPoint:1}} sessionNonce="qa-events"/></div>);`);
 const actions=`
 const state=()=>window.eventState;
 export async function loadPdvEventsAction(){return {ok:true,data:{events:structuredClone(state().events),canManage:true,timeZone:'America/Sao_Paulo'},error:null}};
 export async function createPdvEventAction(input,key){state().createKeys.push(key);if(!state().operations[key]){const utc=v=>new Date(v+'-03:00').toISOString();state().events.push({id:input.id,name:input.name,status:'draft',startsAt:utc(input.startsLocal),endsAt:utc(input.endsLocal),closeStore:input.closeStore,closureReason:input.closureReason,closureStartsAt:utc(input.closureStartsLocal),closureEndsAt:utc(input.closureEndsLocal),items:input.items.map(i=>({productId:i.productId,allocated:i.quantity,sold:0}))});state().operations[key]=true;}if(state().dropCreateResponse){state().dropCreateResponse=false;throw Error('transport interruption')}return {ok:true,id:input.id,error:null}};
 export async function transitionPdvEventAction(id,action,key){if(!state().operations[key]){state().events.find(e=>e.id===id).status={activate:'active',close:'closed',cancel:'canceled'}[action];state().operations[key]=true;}return {ok:true,error:null}};
 export async function restockPdvEventAction(id,items,key){if(!state().operations[key]){const e=state().events.find(e=>e.id===id);for(const i of items)e.items.find(x=>x.productId===i.productId).allocated+=i.quantity;state().operations[key]=true;}return {ok:true,error:null}};
 export async function reportPdvEventAction(id){const sales=state().sales.filter(s=>s.eventId===id);return {ok:true,data:{sales:sales.length,totalCents:sales.reduce((s,o)=>s+o.totalCents,0),discountCents:0},error:null}};
 `;
 const mocks={
 '/src/features/pdv/events/actions.ts':actions,
 '/src/features/pdv/actions.ts':`export async function searchPdvCustomersAction(){return {ok:true,customers:[],error:null}};export async function createPdvSaleAction(input,key){const s=window.eventState;const old=s.sales.find(x=>x.key===key);if(old)return {ok:true,sale:old,error:null};if(input.eventId){const e=s.events.find(x=>x.id===input.eventId);for(const line of input.items){const i=e.items.find(x=>x.productId===line.productId);if(!i||i.allocated-i.sold<line.quantity)return {ok:false,error:'event stock insufficient'};i.sold+=line.quantity}}const sale={key,eventId:input.eventId,orderId:crypto.randomUUID(),displayNumber:s.sales.length+1,totalCents:input.items.reduce((n,i)=>n+1500*i.quantity,0),changeDueCents:0,created:true};s.sales.push(sale);return {ok:true,sale,error:null}};`,
 'next/dynamic':`import React from 'react';export default function dynamic(loader,options){const C=React.lazy(()=>loader().then(defaultExport=>({default:defaultExport})));return props=>React.createElement(React.Suspense,{fallback:options.loading()},React.createElement(C,props));}`,
 'next/link':`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`,
 'next/image':`import React from 'react';export default function Image({unoptimized,...props}){return React.createElement('img',props)}`,
 };
 server=await createServer({configFile:false,root:directory,esbuild:{jsx:'automatic'},resolve:{alias:{'@':path.join(repo,'src'),react:path.join(repo,'node_modules/react'),'react-dom':path.join(repo,'node_modules/react-dom')}},server:{host:'127.0.0.1',port:4177,strictPort:true,fs:{allow:[repo,directory]}},plugins:[{name:'isolated-events',enforce:'pre',resolveId(id){for(const key of Object.keys(mocks))if(id===key||id.endsWith(key)||id.endsWith(key.replace(/\.ts$/,'')))return '\0fixture'+key;},load(id){if(id.startsWith('\0fixture'))return mocks[id.slice(8)]}}]});
 await server.listen();browser=await chromium.launch({headless:true});
 for(const width of [390,1366]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4177'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:4177');await page.evaluate(()=>document.fonts.ready);
  const sale=page.locator('[data-pdv-workspace]').first();await sale.getByRole('button',{name:/Pizza no cone/}).click();
  await page.getByRole('button',{name:'Eventos',exact:true}).click();await page.getByRole('button',{name:'Criar evento'}).click();
  const dialog=page.getByRole('dialog',{name:'Novo evento'});
  await dialog.getByLabel('Nome do evento',{exact:true}).fill('Feira de sábado');
  await dialog.getByLabel('A loja abrirá normalmente?').selectOption('no');
  await dialog.getByLabel('Motivo do fechamento').fill('Participação em feira');
  await dialog.getByLabel('Quantidade de Pizza no cone').fill('1');
  await dialog.getByRole('button',{name:'Salvar evento'}).click();
  await dialog.getByText('A resposta não chegou.',{exact:false}).waitFor({state:'attached'});
  await dialog.getByRole('button',{name:'Salvar evento'}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.eventState.events.length),1);
  assert.equal(await page.evaluate(()=>new Set(window.eventState.createKeys).size),1);
  await page.getByRole('button',{name:'Ativar evento',exact:true}).click();
  await page.getByRole('dialog',{name:'Ativar evento'}).getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.getByRole('button',{name:'Vender neste evento'}).waitFor();
  await page.screenshot({path:path.join(evidence,`events-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'Vender neste evento'}).click();
  const eventSale=page.locator('[data-pdv-workspace]').last();
  await eventSale.getByRole('button',{name:/Pizza no cone/}).click();
  await eventSale.getByRole('button',{name:/Pizza no cone/}).click();
  await eventSale.getByText('Quantidade maior que a disponível no evento.').waitFor({state:'attached'});
  if(width<820)await eventSale.getByRole('button',{name:/Venda ·/}).click();
  await eventSale.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()});
  await eventSale.getByText('finalizada em',{exact:false}).waitFor({state:process.env.PDV_BROWSER_DOM_ONLY?'attached':'visible'});
  assert.equal(await page.evaluate(()=>window.eventState.sales.length),1);
  await page.getByRole('button',{name:'Voltar aos eventos'}).click();
  const restockField=page.getByLabel('Reposição de Pizza no cone');
  if(process.env.PDV_BROWSER_DOM_ONLY)await restockField.evaluate(el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2');el.dispatchEvent(new Event('input',{bubbles:true}));});else await restockField.fill('2');
  await restockField.press('Tab');assert.equal(await restockField.inputValue(),'2');await page.getByRole('button',{name:'Repor quantidades'}).click();
  await page.waitForFunction(()=>window.eventState.events[0].items[0].allocated===3);
  await page.getByRole('button',{name:'Relatório financeiro'}).click();
  await page.getByText(/1 vendas.*Total/).waitFor({state:'attached'});
  await page.getByRole('button',{name:'Encerrar evento',exact:true}).click();await page.getByRole('dialog',{name:'Encerrar evento'}).getByRole('button',{name:'Confirmar',exact:true}).click();
  await page.waitForFunction(()=>window.eventState.events[0].status==='closed');
  await page.getByRole('button',{name:'Venda',exact:true}).click();
  if(width<820)await sale.getByRole('button',{name:/Venda ·/}).click();
  const retained=sale.locator('[data-pdv-panel="sale"]').getByText('Pizza no cone',{exact:true});
  await retained.waitFor({state:process.env.PDV_BROWSER_DOM_ONLY?'attached':'visible'});
  assert.deepEqual(errors,[]);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  results.push({width,domOnly:!!process.env.PDV_BROWSER_DOM_ONLY,createTransportRetry:true,activationClosureConfirmation:true,overstockBlocked:true,saleDoubleSubmitGuard:true,restock:true,report:true,close:true,normalCartPreserved:true,horizontalOverflow:overflow,pageErrors:errors});
  await page.close();
 }
 await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await server?.close();await rm(directory,{recursive:true,force:true});}

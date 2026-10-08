const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium } = require(
  process.env.PANCO_PLAYWRIGHT_MODULE || "playwright",
);

// Offline browser regression: real React hook, controlled Supabase responses, no production data.
(async () => {
  const bundle = await esbuild.build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
import React, {useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {usePanco} from './packages/react-features/src/use-panco';
import {demoData} from './packages/react-features/src/demo';
const source = demoData();
source.transactions = [{...source.transactions[0], id:'tx', category_id:'original', description:'Teste', merchant_name:'Teste', source:'manual'}];
const mock = window.mock = { source, hold:false, reads:[], writes:[], count:0, auth:null, realtime:null };
const client = {
 auth: {
  getSession: async()=>({data:{session:{user:{id:'one'}}},error:null}),
  onAuthStateChange(fn){mock.auth=fn;return {data:{subscription:{unsubscribe(){}}}}},
  async signOut(){mock.auth('SIGNED_OUT',null);return {error:null}}
 },
 from(table){return {
  select(){return this}, order(){return this},
  range(){mock.count++; const result={data:structuredClone(table==='monthly_budgets'?mock.source.budgets||[]:mock.source[table]),error:null};
   if(table==='transactions' && mock.hold)return new Promise(resolve=>mock.reads.push(()=>resolve(result)));
   return Promise.resolve(result);
  },
  update(values){return {eq(key,id){return {select(){return {single(){return new Promise(resolve=>mock.writes.push(ok=>{
    if(ok) mock.source.transactions=mock.source.transactions.map(t=>t.id===id?{...t,...values}:t);
    resolve({data:ok?{id}:null,error:ok?null:new Error('Falha simulada')});
   }))}}}}}}},
  upsert(values){return {select(){return {async single(){return {data:{...values,id:values.id||'saved'},error:null}}}}}}
 }},
 async rpc(name){return {data:name==='forecast_month'?source.forecast:'manual-id',error:null}},
 channel(){return {on(event,filter,fn){mock.realtime=fn;return this},subscribe(){return this}}},
 removeChannel(){}
};
function Content(){const [value,setValue]=useState('');useEffect(()=>{window.mounts=(window.mounts||0)+1},[]);return <div style={{height:2000}}><input aria-label="Filtro preservado" value={value} onChange={e=>setValue(e.target.value)}/></div>}
function App(){const p=usePanco(client); window.panco=p;return <>{p.loading?<p>Carregando</p>:<Content/>}<output>{p.data.transactions[0]?.category_id}</output></>}
createRoot(document.getElementById('root')).render(<App/>);
`,
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PANCO_CHROME
      ? { executablePath: process.env.PANCO_CHROME }
      : {}),
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => r.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(
      () =>
        window.panco.data.transactions.length === 1 && !window.panco.loading,
    );
    await page.getByLabel("Filtro preservado").fill("Outubro");
    await page.evaluate(() => scrollTo(0, 600));
    const initialMounts = await page.evaluate(() => window.mounts);

    // A read started before a mutation must not overwrite its optimistic category.
    await page.evaluate(() => {
      mock.hold = true;
      void panco.refresh();
    });
    await page.waitForFunction(() => mock.reads.length === 1);
    await page.evaluate(() => {
      window.writeResult = "pending";
      panco.categorize("tx", "new").then(
        () => (window.writeResult = "saved"),
        (e) => (window.writeResult = e.message),
      );
    });
    await page.waitForFunction(
      () => panco.data.transactions[0].category_id === "new",
    );
    assert.equal(await page.evaluate(() => panco.loading), false);
    await page.evaluate(() => mock.reads.shift()());
    await page.waitForTimeout(30);
    assert.equal(
      await page.evaluate(() => panco.data.transactions[0].category_id),
      "new",
    );
    await page.evaluate(() => {
      void panco.refresh();
    });
    await page.waitForFunction(() => mock.reads.length === 1);
    await page.evaluate(() => mock.writes.shift()(true));
    await page.waitForFunction(
      () => window.writeResult === "saved" && mock.reads.length === 2,
    );
    await page.evaluate(() => mock.reads.pop()()); // new response first
    await page.waitForTimeout(30);
    await page.evaluate(() => mock.reads.shift()()); // stale response last
    await page.waitForTimeout(30);
    assert.equal(
      await page.evaluate(() => panco.data.transactions[0].category_id),
      "new",
    );
    assert.equal(
      await page.getByLabel("Filtro preservado").inputValue(),
      "Outubro",
    );
    assert.equal(await page.evaluate(() => window.mounts), initialMounts);
    assert.equal(await page.evaluate(() => scrollY), 600);

    // Failed save restores only the affected category and keeps the screen mounted.
    await page.evaluate(() => {
      panco.categorize("tx", "bad").catch((e) => (window.failure = e.message));
    });
    await page.waitForFunction(
      () => panco.data.transactions[0].category_id === "bad",
    );
    await page.evaluate(() => mock.writes.shift()(false));
    await page.waitForFunction(
      () =>
        window.failure === "Falha simulada" &&
        panco.data.transactions[0].category_id === "new",
    );
    await page.evaluate(() => {
      while (mock.reads.length) mock.reads.shift()();
    });
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.mounts), initialMounts);

    // Token renewal is not another page load; a confirmed manual save does not wait for refresh.
    const before = await page.evaluate(() => mock.count);
    await page.evaluate(() =>
      mock.auth("TOKEN_REFRESHED", { user: { id: "one" } }),
    );
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => mock.count), before);
    await page.evaluate(() => {
      window.manualDone = false;
      panco.createTransaction({}).then(() => (window.manualDone = true));
    });
    await page.waitForFunction(
      () => window.manualDone && mock.reads.length === 1,
    );
    assert.equal(await page.evaluate(() => panco.loading), false);

    // Logout invalidates in-flight data; previous responses cannot leak into another session.
    await page.evaluate(() => panco.logout());
    await page.evaluate(() => mock.reads.shift()());
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => panco.data.transactions.length), 0);
    await page.evaluate(() => {
      mock.source.transactions = [];
      mock.auth("SIGNED_IN", { user: { id: "two" } });
    });
    await page.waitForFunction(() => mock.reads.length === 1);
    await page.evaluate(() => mock.reads.shift()());
    await page.waitForFunction(() => !panco.loading);
    assert.equal(await page.evaluate(() => panco.data.transactions.length), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: optimistic category, rollback, stale reads, filters/scroll, token renewal, manual save, logout/session isolation",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

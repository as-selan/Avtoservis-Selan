import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=process.cwd(),dest=path.resolve(root,'.next/unified-ui-fixture');
if(!fs.existsSync(path.join(root,'src/lib/quibi/unified-workflow.ts'))||!dest.startsWith(root+path.sep))throw Error('INVALID_WORKSPACE');
fs.mkdirSync(dest,{recursive:true});
for(const f of execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split(/\r?\n/)){
 if(!f||f.startsWith('.env')||f.endsWith('.png'))continue;
 const target=path.join(dest,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f,target);
}
if(!fs.existsSync(path.join(dest,'node_modules')))fs.symlinkSync(path.join(root,'node_modules'),path.join(dest,'node_modules'),'junction');
// Fixture actions ONLY in ignored copy. No real Quibi transport, credentials, flags or database writes.
const fixtures={
  "src/lib/qa-unified-state.ts": "import \"server-only\";\nconst g=globalThis as typeof globalThis&{selanUnifiedFixture?:{sends:number;polls:number}};\nexport const state=g.selanUnifiedFixture??=( {sends:0,polls:0});",
  "src/lib/quibi/unified-actions.ts": "\"use server\";\nimport {state} from \"@/lib/qa-unified-state\";\nexport async function approveAndSendQuibiEstimate(form:FormData){if(form.get(\"reviewConfirmed\")!==\"yes\")return{ok:false as const,message:\"fixture missing confirmation\"};state.sends++;await new Promise(r=>setTimeout(r,1000));return{ok:true as const,status:\"queued\",detail:\"Isolated fixture queued\"}}\nexport async function pollQuibiEstimateSend(){state.polls++;return{ok:true as const,status:state.polls>1?\"sent\":\"queued\",detail:state.polls>1?\"Isolated fixture: predano poštnemu strežniku; prejem ni potrjen.\":\"Isolated fixture queued\"}}",
  "src/app/qa-unified/page.tsx": "import {QuibiEstimateWorkflowPanel} from \"@/components/dashboard/QuibiEstimateWorkflowPanel\";\nimport {state} from \"@/lib/qa-unified-state\";\nexport const dynamic=\"force-dynamic\";\nexport default async function QA({searchParams}:{searchParams:Promise<{approved?:string}>}){const q=await searchParams;return <main><h1>Izolirani UI fixture — ni dejanskega pošiljanja</h1><QuibiEstimateWorkflowPanel serviceRequestId=\"9d40c42f-b6a8-473b-983f-f9620df97d10\" quoteId=\"ab9f75b2-e6f3-45c7-82de-e36c82faab7b\" documentId=\"2176888\" reviewStatus={q.approved?\"approved_for_send\":\"unreviewed\"} sha256={\"a\".repeat(64)} amount=\"122\" lines={[{description:\"QA storitev\",quantity:\"1\",grossPrice:\"122\"}]} recipient=\"qa@fixture.mail\" dev operationState={state.sends?\"uncertain\":undefined} sendId={state.sends?\"fixture-id\":null} sendStatus={state.sends?(state.polls>1?\"sent\":\"queued\"):null} manualIdentityRequired={false} alreadyDelivered={false}/><output>fixture sends:{state.sends}; polls:{state.polls}</output></main>}",
  "src/app/qa-unified/state/route.ts": "import {state} from \"@/lib/qa-unified-state\";export async function GET(){return Response.json(state)}export async function DELETE(){state.sends=0;state.polls=0;return Response.json(state)}"
};
fixtures['src/app/layout.tsx']='// Functional isolated fixture: exclude font/network and unrelated page layout.\nexport default function Layout({children}:{children:React.ReactNode}){return <html lang="sl"><body>{children}</body></html>}';
for(const [file,content] of Object.entries(fixtures)){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content)}
console.log('Start Next dev in '+dest+' on 127.0.0.1:47865, then run node scripts/qa-unified-ui-check.mjs');

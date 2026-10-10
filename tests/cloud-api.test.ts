import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cloudFixture } from './cloud-fixture';
import { createCloudHandler } from '../server/cloudApi';
import { loadDatabase } from '../server/postgresStore';
import { createDemoDatabase } from '../src/data/demoDatabase';
import { ApiRepository } from '../src/data/apiRepository';
import { CLOUD_PART_CHARACTERS, MAX_ATTACHMENT_BYTES, MAX_CLOUD_BODY_BYTES } from '../src/domain/attachments';
import type { Database } from '../src/domain/types';
import { balance, DomainError } from '../src/domain/service';
import { PostgresStore } from '../server/postgresStore';

const requestInput={leaveTypeId:1,maternityCaseId:null,startDate:'2026-11-16',endDate:'2026-11-16',duration:'Full' as const,reason:'ทดสอบข้อมูลร่วมกัน'};

test('Cloud PostgreSQL: shared data, scoped snapshots and persistent hashed sessions across handlers',async()=>{
 const fixture=await cloudFixture();
 try {
  const a=fixture.client(),b=fixture.client(),manager=fixture.client(),sales=fixture.client(),hr=fixture.client();
  assert.equal((await a.request('/snapshot')).status,401);
  assert.equal((await a.request('/commands','POST',{}, {'Content-Length':String(MAX_CLOUD_BODY_BYTES+1)})).status,401);
  assert.equal((await a.login('employee@demo.local')).status,200);
  await b.login('employee@demo.local');await manager.login('manager@demo.local');await sales.login('sales-manager@demo.local');await hr.login('hr@demo.local');
  const cookie=a.cookie;const tokens=await fixture.db.query<{token_hash:string}>('SELECT token_hash FROM leave_app.app_session');
  assert(tokens.rows.every(row=>row.token_hash!==cookie.slice('leave_session='.length)&&row.token_hash.length===64));
  const posted=await a.request('/commands','POST',{type:'submit',input:requestInput,actorId:8,role:'HR'});
  assert.equal(posted.status,200);const {id}=await posted.json();
  const second:Database=await (await b.request('/snapshot')).json();
  assert(second.requests.some(row=>row.id===id&&row.employeeId===1));
  assert(second.requests.every(row=>row.employeeId===1));assert(second.documents.every(row=>row.remote&&row.dataUrl===''));
  const team:Database=await (await manager.request('/snapshot')).json();assert(team.requests.some(row=>row.id===id));
  const other:Database=await (await sales.request('/snapshot')).json();assert(!other.requests.some(row=>row.id===id));
  assert.equal((await a.request('/commands','POST',{type:'approve',id,version:1,comment:''})).status,403);
  assert.equal((await sales.request('/commands','POST',{type:'approve',id,version:1,comment:''})).status,403);
  const results=await Promise.all([manager.request('/commands','POST',{type:'approve',id,version:1,comment:''}),manager.request('/commands','POST',{type:'approve',id,version:1,comment:''})]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  const changed:Database=await (await b.request('/snapshot')).json();assert.equal(changed.requests.find(row=>row.id===id)?.status,'Approved');
  fixture.restart();assert.equal((await a.request('/session')).status,200);
  const colleagues=await (await b.request('/colleagues?date=2026-11-16')).json();assert.equal(colleagues.length,10);assert.equal(colleagues.find((row:any)=>row.employeeId===1).leaveDuration,'Full');
  assert(fixture.queries.some(sql=>sql.includes('pg_advisory_xact_lock')));assert(fixture.queries.some(sql=>sql.includes('FOR UPDATE')));
  assert.equal((await a.request('/commands','POST',{type:'work',date:'2026-11-17',statusType:'WFH'},{Origin:'https://evil.test'})).status,403);
  await a.request('/session','DELETE');assert.equal((await a.request('/session')).status,401);assert.equal((await b.request('/session')).status,200);
  const reset=await hr.request('/demo/reset','POST');assert.equal(reset.status,200);
  assert.equal((await (await hr.request('/snapshot')).json()).requests.length,createDemoDatabase().requests.length);
 } finally {await fixture.close()}
});

test('Cloud maternity uses the latest owner and case, preserves ordered errors and HR consultation',async()=>{
 const fixture=await cloudFixture();
 try {
  const male=fixture.client(),female=fixture.client(),manager=fixture.client(),hr=fixture.client(),other=fixture.client();
  await male.login('nat@demo.local');await female.login('orn@demo.local');await manager.login('manager@demo.local');await hr.login('hr@demo.local');await other.login('other@demo.local');
  const maternity={...requestInput,leaveTypeId:4,maternityCaseId:1,startDate:'2026-12-20',endDate:'2027-01-04',reason:'ลาคลอดข้ามปี'};
  const invalid=await male.request('/commands','POST',{type:'submit',input:{...maternity,startDate:'ผิด',attachment:{uploadId:'invalid'}},gender:'Female'});
  assert.equal(invalid.status,400);assert.match((await invalid.json()).message,/พนักงานชาย/);
  const otherResult=await other.request('/commands','POST',{type:'submit',input:maternity});assert.match((await otherResult.json()).message,/ตรวจสอบข้อมูลเพศ/);
  assert.equal((await hr.request('/commands','POST',{type:'maternity',employeeId:2,maximumDays:120})).status,400);
  const noCaseAccount=fixture.client();await noCaseAccount.login('employee@demo.local');
  const noCase=await noCaseAccount.request('/commands','POST',{type:'submit',input:{...maternity,maternityCaseId:null}});assert.match((await noCase.json()).message,/ยังไม่มีกรณีลาคลอด/);
  const foreignCase=await female.request('/commands','POST',{type:'submit',input:{...maternity,maternityCaseId:2}});assert.match((await foreignCase.json()).message,/ไม่ใช่ของเจ้าของคำขอ/);
  const cases=await fixture.db.query<{maternity_case_id:number}>('SELECT maternity_case_id FROM leave_app.maternity_case WHERE employee_id=3');const caseId=cases.rows[0].maternity_case_id;
  const state:Database=await (await female.request('/snapshot')).json();
  for(const old of state.requests.filter(row=>row.status==='Pending'))await female.request('/commands','POST',{type:'withdraw',id:old.id,version:old.version});
  const half=await female.request('/commands','POST',{type:'submit',input:{...maternity,maternityCaseId:caseId,duration:'AM'}});assert.match((await half.json()).message,/เต็มวัน/);
  const posted=await female.request('/commands','POST',{type:'submit',input:{...maternity,maternityCaseId:caseId}});assert.equal(posted.status,200);const {id}=await posted.json();
  const updated:Database=await (await female.request('/snapshot')).json();assert.equal(updated.days.filter(row=>row.leaveId===id).length,16);
  assert(updated.days.filter(row=>row.leaveId===id).every(row=>row.entitlementId===null));
  const edit=await female.request('/commands','POST',{type:'edit',id,version:1,input:{...maternity,maternityCaseId:caseId}});assert.equal(edit.status,200);
  assert.equal((await manager.request('/commands','POST',{type:'refer',id,version:2,hrId:5,comment:'ขอความเห็น'})).status,200);
  assert.equal((await manager.request('/commands','POST',{type:'approve',id,version:3,comment:''})).status,400);
  assert.equal((await hr.request('/commands','POST',{type:'consult',id,version:3,comment:'ข้อมูลครบ'})).status,200);
  await fixture.db.query('UPDATE leave_app.employee SET gender=$1 WHERE employee_id=3',['Male']);
  const genderChanged=await manager.request('/commands','POST',{type:'approve',id,version:4,comment:''});assert.match((await genderChanged.json()).message,/พนักงานชาย/);
  await fixture.db.query('UPDATE leave_app.employee SET gender=$1 WHERE employee_id=3',['Female']);
  await fixture.db.query('UPDATE leave_app.maternity_case SET maximum_days=10 WHERE maternity_case_id=$1',[caseId]);
  assert.equal((await manager.request('/commands','POST',{type:'approve',id,version:4,comment:''})).status,409);
  await fixture.db.query('UPDATE leave_app.maternity_case SET maximum_days=120 WHERE maternity_case_id=$1',[caseId]);
  assert.equal((await manager.request('/commands','POST',{type:'approve',id,version:4,comment:''})).status,200);
 } finally {await fixture.close()}
});

test('Cloud support migration is repeatable and login remains disabled until explicitly configured',async()=>{
 const fixture=await cloudFixture();
 try {
  const handler=createCloudHandler(fixture.store,{demoLogin:false});
  assert.equal((await handler(new Request('https://leave.test/api/session',{method:'POST',body:'{}'}))).status,503);
  const response=await fixture.handle(new Request('https://leave.test/api/router?endpoint=health'));
  assert.equal(response.status,200);assert.equal((await response.json()).mode,'cloud-postgres');
  const client=fixture.client();await client.login('employee@demo.local');
  await fixture.db.exec(readFileSync(new URL('../database/supabase/002-cloud-api.sql',import.meta.url),'utf8'));
  assert.equal((await client.request('/session')).status,200);
  await fixture.db.query("UPDATE leave_app.app_session SET expires_at='2000-01-01'");
  assert.equal((await client.request('/snapshot')).status,401);
  await client.login('employee@demo.local');
  await fixture.db.query('UPDATE leave_app.employee SET active=0 WHERE employee_id=1');
  assert.equal((await client.request('/snapshot')).status,401);
 } finally {await fixture.close()}
});

test('Cloud staged files are owner-scoped, validated, consumed atomically and do not bypass gender order',async()=>{
 const fixture=await cloudFixture();
 try {
  const a=fixture.client(),b=fixture.client(),male=fixture.client(),manager=fixture.client();
  await a.login('employee@demo.local');await b.login('orn@demo.local');await male.login('nat@demo.local');await manager.login('manager@demo.local');
  const file=Buffer.from('%PDF-1.7\nทดสอบไฟล์');const metadata={fileName:'หลักฐาน.pdf',fileType:'application/pdf',fileSize:file.length,encodedLength:file.toString('base64').length};
  assert.equal((await manager.request('/uploads','POST',metadata)).status,403);
  assert.equal((await a.request('/uploads','POST',{...metadata,fileSize:MAX_ATTACHMENT_BYTES+1})).status,400);
  const max=await a.request('/uploads','POST',{...metadata,fileSize:MAX_ATTACHMENT_BYTES,encodedLength:4*Math.ceil(MAX_ATTACHMENT_BYTES/3)});assert.equal(max.status,200);const maxId=(await max.json()).uploadId;await a.request('/uploads/'+maxId,'DELETE');
  const upload=await a.request('/uploads','POST',metadata);const {uploadId}=await upload.json();
  assert.equal((await b.request(`/uploads/${uploadId}/parts/0`,'PUT',{data:file.toString('base64')})).status,404);
  await a.request(`/uploads/${uploadId}/parts/0`,'PUT',{data:file.toString('base64')});
  const maleResult=await male.request('/commands','POST',{type:'submit',input:{...requestInput,leaveTypeId:4,startDate:'wrong',attachment:{uploadId}}});assert.match((await maleResult.json()).message,/พนักงานชาย/);
  assert.equal((await b.request('/commands','POST',{type:'submit',input:{...requestInput,attachment:{uploadId}}})).status,400);
  const result=await a.request('/commands','POST',{type:'submit',input:{...requestInput,attachment:{uploadId}}});assert.equal(result.status,200);const {id}=await result.json();
  assert.equal((await fixture.db.query('SELECT * FROM leave_app.app_upload WHERE upload_id=$1',[uploadId])).rows.length,0);
  const snapshot:Database=await (await a.request('/snapshot')).json(),document=snapshot.documents.find(item=>item.leaveId===id)!;
  assert.equal(document.dataUrl,'');assert(document.remote);
  assert.equal((await b.request('/documents/'+document.id)).status,403);assert.equal((await b.request(`/documents/${document.id}/parts/0`)).status,403);
  assert.equal((await manager.request('/documents/'+document.id)).status,200);
  const data=await (await a.request(`/documents/${document.id}/parts/0`)).json();assert.equal(data.data,`data:application/pdf;base64,${file.toString('base64')}`);
  await a.request('/commands','POST',{type:'work',date:'2026-11-17',statusType:'WFH'});
  assert.equal((await (await a.request(`/documents/${document.id}/parts/0`)).json()).data,data.data);
  const invalid=Buffer.from('not a PDF').toString('base64');const start=await a.request('/uploads','POST',{...metadata,fileSize:9,encodedLength:invalid.length});const badId=(await start.json()).uploadId;
  await a.request(`/uploads/${badId}/parts/0`,'PUT',{data:invalid});
  const failed=await a.request('/commands','POST',{type:'edit',id,version:1,input:{...requestInput,attachment:{uploadId:badId}}});assert.equal(failed.status,400);
  assert.equal((await (await a.request('/snapshot')).json()).requests.find((row:any)=>row.id===id).version,1);
  assert.equal((await fixture.db.query('SELECT * FROM leave_app.app_upload WHERE upload_id=$1',[badId])).rows.length,1);
 } finally {await fixture.close()}
});

test('ApiRepository sends multiple bounded cloud parts and downloads exact bytes on another client',async()=>{
 const fixture=await cloudFixture(),oldFetch=globalThis.fetch;
 const context=new AsyncLocalStorage<{cookie:string}>();const bodies:number[]=[];const replies:number[]=[];
 try {
  globalThis.fetch=async(input,init)=>{
   const current=context.getStore()!;const request=new Request(input,init);if(current.cookie)request.headers.set('Cookie',current.cookie);
   if(typeof init?.body==='string')bodies.push(Buffer.byteLength(init.body));
   const response=await fixture.handle(request);const next=response.headers.get('set-cookie');if(next)current.cookie=next.split(';')[0];
   replies.push(Buffer.byteLength(await response.clone().text()));return response;
  };
  const a={cookie:''},b={cookie:''};const first=new ApiRepository('https://leave.test/api'),second=new ApiRepository('https://leave.test/api');
  await context.run(a,()=>first.login('employee@demo.local','demo1234'));await context.run(b,()=>second.login('employee@demo.local','demo1234'));
  const file=Buffer.alloc(5*1024*1024,71);file.write('%PDF-1.7\n');
  const posted=await context.run(a,()=>first.execute({type:'submit',input:{...requestInput,attachment:{fileName:'หลายส่วน.pdf',fileType:'application/pdf',fileSize:file.length,dataUrl:'data:application/pdf;base64,'+file.toString('base64')}}}));
  const state:Database=await context.run(b,()=>second.snapshot()),doc=state.documents.find(item=>item.leaveId===posted.id)!;
  const blob=await context.run(b,()=>second.downloadDocument(doc));
  assert.equal(blob.size,file.length);
  assert.equal(createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex'),createHash('sha256').update(file).digest('hex'));
  assert(bodies.some(size=>size>CLOUD_PART_CHARACTERS));assert(bodies.every(size=>size<MAX_CLOUD_BODY_BYTES));assert(replies.every(size=>size<MAX_CLOUD_BODY_BYTES));
  assert.equal((await fixture.db.query<{count:number}>('SELECT count(*)::integer AS count FROM leave_app.app_upload')).rows[0].count,0);
  const metadata=await fixture.store.transaction(client=>loadDatabase(client));assert(metadata.documents.every(item=>item.dataUrl===''));
 } finally {globalThis.fetch=oldFetch;await fixture.close()}
});

test('Cloud pending quota is reserved across simultaneous requests, edit excludes itself and approval checks latest grant',async()=>{
 const fixture=await cloudFixture();
 try {
  const employee=fixture.client(),second=fixture.client(),manager=fixture.client(),hr=fixture.client();
  await employee.login('employee@demo.local');await second.login('employee@demo.local');await manager.login('manager@demo.local');await hr.login('hr@demo.local');
  const state:Database=await (await employee.request('/snapshot')).json();
  for(const row of state.requests.filter(item=>item.status==='Pending'))assert.equal((await employee.request('/commands','POST',{type:'withdraw',id:row.id,version:row.version})).status,200);
  const used=balance(state,1,1,2026).used;
  await hr.request('/commands','POST',{type:'entitlement',employeeId:1,leaveTypeId:1,year:2026,grantedDays:used+1});
  const responses=await Promise.all([employee.request('/commands','POST',{type:'submit',input:requestInput}),second.request('/commands','POST',{type:'submit',input:{...requestInput,startDate:'2026-11-17',endDate:'2026-11-17'}})]);
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,400]);
  const failed=await responses.find(response=>response.status===400)!.json();assert.match(failed.message,/สิทธิ์ปี.*ไม่พอ/);
  const {id}=await responses.find(response=>response.status===200)!.json();
  const current:Database=await (await employee.request('/snapshot')).json();const row=current.requests.find(item=>item.id===id)!;
  const edit=await employee.request('/commands','POST',{type:'edit',id,version:row.version,input:{...requestInput,startDate:row.startDate,endDate:row.endDate}});assert.equal(edit.status,200);
  const overlap=await employee.request('/commands','POST',{type:'submit',input:{...requestInput,startDate:row.startDate,endDate:row.endDate}});assert.match((await overlap.json()).message,/วันที่ลาซ้อน/);
  assert.equal((await hr.request('/commands','POST',{type:'entitlement',employeeId:1,leaveTypeId:1,year:2026,grantedDays:used})).status,400);
  // Simulate an administrator changing rights outside the application; approval must recheck.
  await fixture.db.query('UPDATE leave_app.leave_entitlement SET granted_days=$1 WHERE employee_id=1 AND leave_type_id=1 AND entitlement_year=2026',[used]);
  assert.equal((await manager.request('/commands','POST',{type:'approve',id,version:2,comment:''})).status,409);
  const pending:Database=await (await employee.request('/snapshot')).json();assert.equal(pending.requests.find(item=>item.id===id)?.status,'Pending');
  await hr.request('/commands','POST',{type:'entitlement',employeeId:1,leaveTypeId:1,year:2026,grantedDays:used+1});
  assert.equal((await manager.request('/commands','POST',{type:'approve',id,version:2,comment:''})).status,200);
  const approved:Database=await (await employee.request('/snapshot')).json();assert.equal(balance(approved,1,1,2026).used,used+1);
 } finally {await fixture.close()}
});

test('Cloud rejects malformed and oversized bodies; missing schema/config never switches to local storage',async()=>{
 const fixture=await cloudFixture();
 try {
  const client=fixture.client();await client.login('employee@demo.local');
  for(const raw of ['null','{broken']) {
   const response=await fixture.handle(new Request('https://leave.test/api/commands',{method:'POST',headers:{Cookie:client.cookie},body:raw}));assert.equal(response.status,400);
  }
  assert.equal((await client.request('/commands','POST',{type:'work'},{'Content-Length':String(MAX_CLOUD_BODY_BYTES+1)})).status,413);
  await fixture.db.exec('DROP TABLE leave_app.app_upload_part');
  assert.equal((await client.request('/health')).status,503);
 } finally {await fixture.close()}
 const savedUrl=process.env.POSTGRES_URL,savedAlternate=process.env.DATABASE_URL,oldFetch=globalThis.fetch;
 delete process.env.POSTGRES_URL;delete process.env.DATABASE_URL;
 try {
  const handler=createCloudHandler(new PostgresStore());
  globalThis.fetch=async(input,init)=>handler(new Request(input,init));
  const repository=new ApiRepository('https://leave.test/api');
  await assert.rejects(repository.session(),(error:unknown)=>error instanceof DomainError&&error.code==='UNAVAILABLE');
 } finally {
  globalThis.fetch=oldFetch;
  if(savedUrl===undefined)delete process.env.POSTGRES_URL;else process.env.POSTGRES_URL=savedUrl;
  if(savedAlternate===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=savedAlternate;
 }
});

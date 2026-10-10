import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createCloudHandler } from '../server/cloudApi';
import { PostgresStore, type SqlPool } from '../server/postgresStore';

/** One engine connection needs a lease queue; real deployment uses pg.Pool + database locks. */
export async function cloudFixture() {
 const db=new PGlite();
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 await db.exec(readFileSync(new URL('../database/supabase/setup-10-people.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../database/supabase/002-cloud-api.sql',import.meta.url),'utf8'));
 let queue=Promise.resolve();const queries:string[]=[];
 const pool:SqlPool={async connect(){
  const previous=queue;let release!:()=>void;queue=new Promise<void>(resolve=>{release=resolve});await previous;
  return {query:async(sql:string,values?:unknown[])=>{queries.push(sql);return {rows:(await db.query<Record<string,any>>(sql,values)).rows}},release};
 }};
 const store=new PostgresStore(()=>pool);
 let handler=createCloudHandler(store,{demoLogin:true,now:()=>new Date('2026-10-10T05:00:00.000Z')});
 return {
  db,store,pool,queries,
  handle:(request:Request)=>handler(request),
  restart:()=>{handler=createCloudHandler(new PostgresStore(()=>pool),{demoLogin:true,now:()=>new Date('2026-10-10T05:00:00.000Z')})},
  client(){
   return {
    cookie:'',
    async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={}) {
     const response=await handler(new Request('https://leave.test/api'+path,{method,headers:{...(this.cookie?{Cookie:this.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)}));
     const next=response.headers.get('set-cookie');if(next)this.cookie=next.split(';')[0];
     return response;
    },
    async login(email:string){return this.request('/session','POST',{email,password:'demo1234'})},
   };
  },
  close:()=>db.close(),
 };
}

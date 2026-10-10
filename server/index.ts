import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { actorById, applyCommand, DomainError, visibleSnapshot } from '../src/domain/service';
import { DEMO_PASSWORD } from '../src/domain/seed';
import { databasePath, transact } from './store';
import { createDemoDatabase } from '../src/data/demoDatabase';
import type { Command } from '../src/domain/types';
const host=process.env.MOCK_HOST||'127.0.0.1';const port=Number(process.env.MOCK_PORT||3001);
const sessions=new Map<string,{id:number;expires:number}>();
function send(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
async function body(req:IncomingMessage){let bytes=0;const chunks:Buffer[]=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4*1024*1024)throw new DomainError('ข้อมูลในคำขอใหญ่เกินไป','PAYLOAD_TOO_LARGE');chunks.push(chunk)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{throw new DomainError('JSON ไม่ถูกต้อง')}}
function sessionToken(req:IncomingMessage){return req.headers.cookie?.split(';').map(p=>p.trim()).find(p=>p.startsWith('leave_session='))?.slice('leave_session='.length)}
function authenticate(req:IncomingMessage){const token=sessionToken(req);const s=token?sessions.get(token):null;if(!s||s.expires<Date.now()){if(token)sessions.delete(token);throw new DomainError('กรุณาเข้าสู่ระบบ','UNAUTHENTICATED')}return s.id}
export const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url||'/',`http://${req.headers.host}`).pathname;
  // Mock server only: require same localhost hostname to limit cross-site mutations.
  if(!['GET','HEAD'].includes(req.method||'GET')&&req.headers.origin){const origin=new URL(req.headers.origin);const allowed=['localhost','127.0.0.1','[::1]'];if(!allowed.includes(origin.hostname))throw new DomainError('Origin นี้ไม่ได้รับอนุญาต','FORBIDDEN')}
  if(path==='/api/health'&&req.method==='GET')return send(res,200,{status:'ok',mode:'mock-json'});
  if(path==='/api/session'&&req.method==='POST'){
   const input=await body(req);if(typeof input.email!=='string'||input.password!==DEMO_PASSWORD)throw new DomainError('อีเมลหรือรหัสผ่านตัวอย่างไม่ถูกต้อง','UNAUTHENTICATED');
   const employee=await transact(db=>{const e=db.employees.find(e=>e.email.toLowerCase()===input.email.trim().toLowerCase()&&e.active);if(!e)throw new DomainError('อีเมลหรือรหัสผ่านตัวอย่างไม่ถูกต้อง','UNAUTHENTICATED');return e},true);
   const token=randomBytes(32).toString('hex');const old=sessionToken(req);if(old)sessions.delete(old);
   sessions.set(token,{id:employee.id,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`leave_session=${token}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=28800`);
   return send(res,200,{employee});
  }
  if(path==='/api/session'&&req.method==='DELETE'){const token=sessionToken(req);if(token)sessions.delete(token);res.setHeader('Set-Cookie','leave_session=; HttpOnly; SameSite=Lax; Path=/api; Max-Age=0');return send(res,200,{message:'ออกจากระบบแล้ว'})}
  const actorId=authenticate(req);
  if(path==='/api/session'&&req.method==='GET')return send(res,200,{employee:await transact(db=>actorById(db,actorId))});
  if(path==='/api/snapshot'&&req.method==='GET')return send(res,200,await transact(db=>visibleSnapshot(db,actorId)));
  if(path==='/api/commands'&&req.method==='POST'){const command=await body(req);if(!command||typeof command!=='object'||typeof command.type!=='string')throw new DomainError('คำสั่งไม่ถูกต้อง');return send(res,200,await transact(db=>applyCommand(db,actorId,command as Command),true))}
  if(path==='/api/demo/reset'&&req.method==='POST'){await transact(db=>{if(actorById(db,actorId).role!=='HR')throw new DomainError('เฉพาะ HR เท่านั้น','FORBIDDEN');Object.assign(db,createDemoDatabase())},true);return send(res,200,{message:'คืนค่าข้อมูลจำลองแล้ว'})}
  send(res,404,{message:'ไม่พบ API นี้',code:'NOT_FOUND'});
 }catch(e){const error=e instanceof DomainError?e:new DomainError('เกิดข้อผิดพลาดใน mock server','SERVER');if(!(e instanceof DomainError))console.error(e);const status=error.code==='UNAUTHENTICATED'?401:error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:error.code==='CONFLICT'?409:error.code==='PAYLOAD_TOO_LARGE'?413:error.code==='SERVER'?500:400;send(res,status,{message:error.message,code:error.code})}
});
server.listen(port,host,()=>{const address=server.address();const listeningPort=address&&typeof address==='object'?address.port:port;console.log(`Mock API: http://${host}:${listeningPort}/api`);console.log(`JSON database: ${databasePath}`)});
const stop=()=>server.close(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);

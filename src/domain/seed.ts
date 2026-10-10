import type { Database, LeaveRequest } from './types';
import { addDays, nextWorkingDay, today, workingDates } from './date';
export const DEMO_PASSWORD='demo1234';
export function createSeed(now=new Date()):Database {
 const base=today(now);const year=Number(base.slice(0,4));const at=now.toISOString();
 const db:Database={schemaVersion:1,employees:[
  {id:1,name:'พิมพ์ชนก วัฒนกุล',gender:'Female',email:'employee@demo.local',phone:'0810000001',position:'นักพัฒนาระบบ',role:'Employee',managerId:4,department:'ฝ่ายไอที',active:true},
  {id:2,name:'นัทธพงศ์ สุขใจ',gender:'Male',email:'nat@demo.local',phone:'0810000002',position:'เจ้าหน้าที่ระบบ',role:'Employee',managerId:4,department:'ฝ่ายไอที',active:true},
  {id:3,name:'อรทัย มั่นคง',gender:'Female',email:'orn@demo.local',phone:'0810000003',position:'นักวิเคราะห์ระบบ',role:'Employee',managerId:4,department:'ฝ่ายไอที',active:true},
  {id:4,name:'ธนวัฒน์ กิตติวงศ์',gender:'Male',email:'manager@demo.local',phone:'0810000004',position:'ผู้จัดการฝ่ายไอที',role:'Manager',managerId:null,department:'ฝ่ายไอที',active:true},
  {id:5,name:'ศิริพร ใจดี',gender:'Female',email:'hr@demo.local',phone:'0810000005',position:'เจ้าหน้าที่ฝ่ายบุคคล',role:'HR',managerId:null,department:'ฝ่ายบุคคล',active:true},
  {id:6,name:'กานต์ พรชัย',gender:'Other',email:'other@demo.local',phone:'0810000006',position:'เจ้าหน้าที่ฝ่ายขาย',role:'Employee',managerId:null,department:'ฝ่ายขาย',active:true}
 ],leaveTypes:[
 {id:1,name:'ลาพักร้อน',quotaScope:'Annual',defaultQuotaDays:10,dayCountBasis:'Working Days',advanceNoticeDays:1,documentRequiredFromDays:null,requiredDocumentType:null,eligibleGender:null},
 {id:2,name:'ลาป่วย',quotaScope:'Annual',defaultQuotaDays:30,dayCountBasis:'Working Days',advanceNoticeDays:0,documentRequiredFromDays:3,requiredDocumentType:'Medical Certificate',eligibleGender:null},
 {id:3,name:'ลากิจ',quotaScope:'Annual',defaultQuotaDays:6,dayCountBasis:'Working Days',advanceNoticeDays:1,documentRequiredFromDays:null,requiredDocumentType:null,eligibleGender:null},
 {id:4,name:'ลาคลอด',quotaScope:'Pregnancy',defaultQuotaDays:120,dayCountBasis:'Calendar Days',advanceNoticeDays:1,documentRequiredFromDays:null,requiredDocumentType:null,eligibleGender:'Female'}
 ],entitlements:[],maternityCases:[{id:1,employeeId:3,caseNo:1,maximumDays:120}],requests:[],days:[],documents:[],approvals:[],workStatuses:[],notifications:[],holidays:[]};
 for(const e of db.employees)for(const t of db.leaveTypes.filter(t=>t.quotaScope==='Annual'))for(const y of [year,year+1])db.entitlements.push({id:db.entitlements.length+1,employeeId:e.id,leaveTypeId:t.id,year:y,grantedDays:t.defaultQuotaDays});
 const future=nextWorkingDay(addDays(base,3));const futureEnd=nextWorkingDay(addDays(future,1));
 const past=nextWorkingDay(addDays(base,-20));
 function request(id:number,employeeId:number,leaveTypeId:number,startDate:string,endDate:string,status:LeaveRequest['status'],reason:string){
  const r:LeaveRequest={id,employeeId,leaveTypeId,maternityCaseId:null,startDate,endDate,status,reason,requestDate:at,duration:'Full',version:1,timeline:[{action:'ยื่นคำขอ',actorId:employeeId,at,comment:''}]};
  db.requests.push(r);const dates=workingDates(startDate,endDate);
  dates.forEach(date=>db.days.push({id:db.days.length+1,leaveId:id,date,entitlementId:db.entitlements.find(e=>e.employeeId===employeeId&&e.leaveTypeId===leaveTypeId&&e.year===Number(date.slice(0,4)))?.id??null,units:1}));
  db.approvals.push({id:db.approvals.length+1,leaveId:id,approverId:4,stepNo:1,reviewRole:'Manager',reviewType:'Decision',status:status==='Pending'?'Pending':status==='Approved'?'Approved':'Rejected',comment:status==='Rejected'?'มีงานเร่งด่วน ขอให้ปรับช่วงวันลา':'' ,assignedAt:at,reviewedAt:status==='Pending'?null:at});
  if(status!=='Pending')r.timeline.push({action:status==='Approved'?'อนุมัติคำขอ':'ไม่อนุมัติ',actorId:4,at,comment:status==='Rejected'?'มีงานเร่งด่วน ขอให้ปรับช่วงวันลา':''});
 }
 request(1001,1,1,future,futureEnd,'Pending','เดินทางไปทำธุระกับครอบครัว');
 const sickEnd=nextWorkingDay(addDays(futureEnd,1));
 request(1002,2,2,future,sickEnd,'Pending','พักรักษาตัวตามคำแนะนำแพทย์');
 request(1003,1,1,past,nextWorkingDay(addDays(past,2)),'Approved','พักผ่อนกับครอบครัว');
 request(1004,1,3,nextWorkingDay(addDays(past,7)),nextWorkingDay(addDays(past,7)),'Rejected','ติดต่อหน่วยงานราชการ');
 request(1005,3,1,future,future,'Approved','พักผ่อนประจำปี');
 // A real downloadable text fixture, rather than a fake medical PDF.
 const text='DEMO MEDICAL CERTIFICATE\nFictional attachment for software testing only.\nNot a valid medical certificate.\n';
 db.documents.push({id:1,leaveId:1002,documentType:'Medical Certificate',fileName:'medical_certificate_DEMO.txt',storageKey:'demo/medical_certificate_DEMO.txt',fileType:'text/plain',fileSize:text.length,uploadedAt:at,dataUrl:'data:text/plain;charset=utf-8,'+encodeURIComponent(text)});
 db.approvals.push({id:db.approvals.length+1,leaveId:1002,approverId:5,stepNo:2,reviewRole:'HR',reviewType:'Consultation',status:'Pending',comment:'ขอความเห็นเรื่องเอกสารและเงื่อนไขลาป่วย',assignedAt:at,reviewedAt:null});
 db.requests.find(r=>r.id===1002)!.timeline.push({action:'ส่งปรึกษา HR',actorId:4,at,comment:'ขอความเห็นเรื่องเอกสารและเงื่อนไขลาป่วย'});
 db.workStatuses.push({id:1,employeeId:1,date:base,statusType:'In-office',updatedAt:at},{id:2,employeeId:2,date:base,statusType:'WFH',updatedAt:at},{id:3,employeeId:3,date:base,statusType:'In-office',updatedAt:at});
 db.notifications.push({id:1,employeeId:1,leaveId:1001,text:'ส่งคำขอลาพักร้อนแล้ว กำลังรอผู้จัดการพิจารณา',createdAt:at,read:false},{id:2,employeeId:4,leaveId:1001,text:'พิมพ์ชนกส่งคำขอใหม่ รอพิจารณา',createdAt:at,read:false},{id:3,employeeId:5,leaveId:1002,text:'มีคำขอที่ผู้จัดการส่งให้ HR ร่วมพิจารณา',createdAt:at,read:false});
 return db;
}

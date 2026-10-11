export type Role = 'Employee' | 'Manager' | 'HR';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Withdrawn';
export type Duration = 'Full' | 'AM' | 'PM';
export interface Employee { id: number; name: string; gender: 'Male'|'Female'|'Other'; email: string; phone: string; position: string; role: Role; managerId: number|null; department: string; active: boolean }
export interface LeaveType { id: number; name: string; quotaScope: 'Annual'|'Pregnancy'; defaultQuotaDays: number; dayCountBasis: 'Working Days'|'Calendar Days'; advanceNoticeDays: number; documentRequiredFromDays: number|null; requiredDocumentType: string|null; eligibleGender: Employee['gender']|null }
export interface Entitlement { id: number; employeeId: number; leaveTypeId: number; year: number; grantedDays: number }
export interface MaternityCase { id: number; employeeId: number; caseNo: number; maximumDays: number }
export interface TimelineEvent { action: string; actorId: number; at: string; comment: string }
export interface LeaveRequest { id: number; employeeId: number; leaveTypeId: number; maternityCaseId: number|null; startDate: string; endDate: string; reason: string; requestDate: string; status: RequestStatus; duration: Duration; version: number; timeline: TimelineEvent[] }
export interface LeaveDay { id: number; leaveId: number; date: string; entitlementId: number|null; units: number }
export interface LeaveDocument { id: number; leaveId: number; documentType: string; fileName: string; storageKey: string; fileType: string; fileSize: number; uploadedAt: string; dataUrl: string; remote?: boolean }
export interface LeaveApproval { id: number; leaveId: number; approverId: number; stepNo: number; reviewRole: 'Manager'|'HR'; reviewType: 'Decision'|'Consultation'; status: 'Pending'|'Approved'|'Rejected'|'Completed'; comment: string; assignedAt: string; reviewedAt: string|null; cancelled?:boolean }
export interface WorkStatus { id: number; employeeId: number; date: string; statusType: 'In-office'|'WFH'|'Outside'; updatedAt: string }
export interface ColleagueStatus { employeeId: number; name: string; position: string; department: string; date: string; workStatus: WorkStatus['statusType']|null; leaveDuration: Duration|null; updatedAt: string|null }
export interface Notification { id: number; employeeId: number; leaveId: number|null; text: string; createdAt: string; read: boolean }
export interface Holiday { date: string; name: string }
export interface Database { schemaVersion: 1; employees: Employee[]; leaveTypes: LeaveType[]; entitlements: Entitlement[]; maternityCases: MaternityCase[]; requests: LeaveRequest[]; days: LeaveDay[]; documents: LeaveDocument[]; approvals: LeaveApproval[]; workStatuses: WorkStatus[]; notifications: Notification[]; holidays: Holiday[] }
export interface AttachmentInput { fileName: string; fileType: string; fileSize: number; dataUrl: string }
export interface RequestInput { leaveTypeId: number; maternityCaseId: number|null; startDate: string; endDate: string; duration: Duration; reason: string; attachment?: AttachmentInput|null; keepDocument?: boolean }
export interface Balance { total: number; used: number; remaining: number; pending: number }
export type Command =
 | {type:'submit'; input:RequestInput}
 | {type:'edit'; id:number; version:number; input:RequestInput}
 | {type:'withdraw'; id:number; version:number}
 | {type:'approve'; id:number; version:number; comment:string}
 | {type:'reject'; id:number; version:number; comment:string}
 | {type:'refer'; id:number; version:number; comment:string; hrId:number}
 | {type:'consult'; id:number; version:number; comment:string}
 | {type:'work'; date:string; statusType:WorkStatus['statusType']}
 | {type:'readNotifications'}
 | {type:'entitlement'; employeeId:number; leaveTypeId:number; year:number; grantedDays:number}
 | {type:'maternity'; employeeId:number; maximumDays:number}
 | {type:'holiday'; date:string; name:string; remove?:boolean}
 | {type:'policy'; policy:LeaveType};
export interface CommandResult { id?: number; message: string }
export interface LeaveRepository {
 /** Demo accepts a unique personal username or the full email. */
 login(identifier:string,password:string):Promise<Employee>;
 session():Promise<Employee|null>;
 logout():Promise<void>;
 snapshot():Promise<Database>;
 searchColleagues(query:string,date:string):Promise<ColleagueStatus[]>;
 execute(command:Command):Promise<CommandResult>;
 downloadDocument?(document:LeaveDocument):Promise<Blob>;
 resetDemo():Promise<void>;
}

import type {
  AttachmentInput,
  Balance,
  Command,
  CommandResult,
  Database,
  Employee,
  LeaveDay,
  LeaveRequest,
  RequestInput,
} from './types';
export declare class DomainError extends Error {
  code: string;
  constructor(message: string, code?: string);
}
export declare const requestCode: (r: LeaveRequest) => string;
export declare const totalDays: (db: Database, id: number) => number;
export declare function actorById(db: Database, id: number): Employee;
export declare function canView(db: Database, actor: Employee, r: LeaveRequest): boolean;
export declare function visibleSnapshot(db: Database, actorId: number): Database;
export declare function balance(
  db: Database,
  employeeId: number,
  typeId: number,
  year: number,
  caseId?: number | null,
  excludeId?: number,
): Balance;
export declare function effectiveWorkStatus(db: Database, employeeId: number, date: string): string;
export declare function validateAttachment(a: AttachmentInput): void;
/** Uses the stored owner's gender, never a field supplied with a leave command. */
export declare function maternityGenderIssue(employee: Pick<Employee, 'gender'>): string | null;
export declare function previewRequest(
  db: Database,
  actor: Employee,
  input: RequestInput,
  excludeId?: number,
  now?: Date,
): {
  days: Omit<LeaveDay, 'id' | 'leaveId'>[];
  total: number;
};
/** All mutations must run in one repository transaction; quota is derived from approved Leave_Day rows. */
export declare function applyCommand(
  db: Database,
  actorId: number,
  c: Command,
  now?: Date,
): CommandResult;

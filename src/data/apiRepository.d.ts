import type {
  ColleagueStatus,
  Command,
  Employee,
  LeaveDocument,
  LeaveRepository,
} from '../domain/types';
export declare class ApiRepository implements LeaveRepository {
  private base;
  private capabilities?;
  constructor(base?: any);
  private request;
  login(identifier: string, password: string): Promise<Employee>;
  session(): Promise<any>;
  logout(): Promise<void>;
  snapshot(): Promise<any>;
  searchColleagues(query: string, date: string): Promise<ColleagueStatus[]>;
  execute(command: Command): Promise<any>;
  downloadDocument(document: LeaveDocument): Promise<Blob>;
  resetDemo(): Promise<void>;
}

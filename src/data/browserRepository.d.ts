import type { Command, Database, Employee, LeaveRepository } from '../domain/types';
export declare class BrowserRepository implements LeaveRepository {
  private actorId;
  login(identifier: string, password: string): Promise<Employee>;
  session(): Promise<Employee | null>;
  logout(): Promise<void>;
  snapshot(): Promise<Database>;
  searchColleagues(
    query: string,
    date: string,
  ): Promise<import('../domain/types').ColleagueStatus[]>;
  execute(command: Command): Promise<import('../domain/types').CommandResult>;
  resetDemo(): Promise<void>;
}

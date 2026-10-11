import type { ColleagueStatus, Database } from './types';
/** A display code for the existing Employee.id, not a new stored employee identifier. */
export declare const employeeCode: (id: number) => string;
/** Signed-in staff may look up work availability; private leave data keeps its original scope. */
export declare function searchColleagues(
  db: Database,
  actorId: number,
  query: string,
  date: string,
): ColleagueStatus[];

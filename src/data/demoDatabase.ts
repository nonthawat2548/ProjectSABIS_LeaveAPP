import sample from './leave-management-10-people.json';
import type { Database, Employee } from '../domain/types';

export const DEMO_DATASET_ID = 'leave-management-10-people-v1';
export const DEMO_SESSION_KEY = 'leave-10-people-demo-session';
export const DEMO_DATA_CHANNEL = 'leave-10-people-data';

/** Every repository gets its own copy; mutations never change the source fixture. */
export function createDemoDatabase(): Database {
  return structuredClone(sample as Database);
}

/** Public account choices for the demo login, derived from the same source as repositories. */
export function getDemoAccounts(): Pick<Employee, 'id' | 'name' | 'email' | 'role' | 'department'>[] {
  return (sample as Database).employees
    .filter(employee => employee.active)
    .map(({ id, name, email, role, department }) => ({ id, name, email, role, department }));
}

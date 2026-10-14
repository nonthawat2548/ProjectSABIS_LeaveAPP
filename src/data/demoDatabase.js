import sample from './leave-management-10-people.json' with { type: 'json' };

export const DEMO_DATASET_ID = 'leave-management-10-people-v2';
export const DEMO_SESSION_KEY = 'leave-10-people-demo-session-v2';
export const DEMO_DATA_CHANNEL = 'leave-10-people-data-v2';

/**
 * Every repository gets its own copy; mutations never change the source fixture.
 * @returns {import('../domain/types.js').Database}
 */
export function createDemoDatabase() {
  return structuredClone(sample);
}

/**
 * Public account choices for the demo login, derived from the same source as repositories.
 * @returns {Pick<import('../domain/types.js').Employee, 'id' | 'name' | 'email' | 'role' | 'department'>[]}
 */
export function getDemoAccounts() {
  return sample.employees
    .filter((employee) => employee.active)
    .map(({ id, name, email, role, department }) => ({ id, name, email, role, department }));
}

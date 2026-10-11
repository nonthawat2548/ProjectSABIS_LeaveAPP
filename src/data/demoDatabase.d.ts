import type { Database, Employee } from '../domain/types';
export declare const DEMO_DATASET_ID = 'leave-management-10-people-v1';
export declare const DEMO_SESSION_KEY = 'leave-10-people-demo-session';
export declare const DEMO_DATA_CHANNEL = 'leave-10-people-data';
/** Every repository gets its own copy; mutations never change the source fixture. */
export declare function createDemoDatabase(): Database;
/** Public account choices for the demo login, derived from the same source as repositories. */
export declare function getDemoAccounts(): Pick<
  Employee,
  'id' | 'name' | 'email' | 'role' | 'department'
>[];

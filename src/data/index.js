import { BrowserRepository } from './browserRepository';
import { ApiRepository } from './apiRepository';
export const dataMode = import.meta.env?.VITE_DATA_MODE === 'api' ? 'api' : 'mock';
/** @type {import('../domain/types').LeaveRepository} */
export const repository = dataMode === 'api' ? new ApiRepository() : new BrowserRepository();

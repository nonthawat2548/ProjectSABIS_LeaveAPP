// @ts-check
import { BrowserRepository } from './browserRepository.js';
import { ApiRepository } from './apiRepository.js';
export const dataMode = import.meta.env?.VITE_DATA_MODE === 'api' ? 'api' : 'mock';
/** @type {import('../domain/types.js').LeaveRepository} */
export const repository = dataMode === 'api' ? new ApiRepository() : new BrowserRepository();

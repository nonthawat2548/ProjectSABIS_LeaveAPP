import type { Command, Employee, LeaveRepository } from '../domain/types';
import { DomainError } from '../domain/service';
export class ApiRepository implements LeaveRepository {
    constructor(private base = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '')) { }
    private async request(path: string, method = 'GET', body?: unknown) {
        let response: Response; try { response = await fetch(this.base + path, { method, credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) } catch { throw new DomainError('เชื่อมต่อหลังบ้านไม่ได้ ตรวจสอบ VITE_API_BASE_URL และเปิด mock server', 'NETWORK') }
        const data = await response.json().catch(() => ({ message: 'หลังบ้านส่งข้อมูลที่ไม่ใช่ JSON' }));
        if (!response.ok) throw new DomainError(data.message ?? 'การเชื่อมต่อมีปัญหา', data.code ?? 'API'); return data;
    }
    async login(email: string, password: string): Promise<Employee> { return (await this.request('/session', 'POST', { email, password })).employee }
    async session() { try { return (await this.request('/session')).employee } catch (e) { if (e instanceof DomainError && e.code === 'UNAUTHENTICATED') return null; throw e } }
    async logout() { await this.request('/session', 'DELETE') }
    async snapshot() { return this.request('/snapshot') }
    async execute(command: Command) { return this.request('/commands', 'POST', command) }
    async resetDemo() { await this.request('/demo/reset', 'POST', {}) }
}

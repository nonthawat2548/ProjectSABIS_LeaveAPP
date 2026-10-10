import type { ColleagueStatus, Command, Employee, LeaveRepository } from '../domain/types';
import { DomainError } from '../domain/service';
export class ApiRepository implements LeaveRepository {
    constructor(private base = (import.meta.env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '')) { }
    private async request(path: string, method = 'GET', body?: unknown) {
        let response: Response; try { response = await fetch(this.base + path, { method, credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) } catch { throw new DomainError('ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้งหรือติดต่อผู้ดูแลระบบ', 'NETWORK') }
        const data = await response.json().catch(() => ({ message: 'ระบบส่งข้อมูลไม่ถูกต้อง กรุณาลองอีกครั้ง' }));
        if (!response.ok) throw new DomainError(data.message ?? 'การเชื่อมต่อมีปัญหา', data.code ?? 'API'); return data;
    }
    async login(email: string, password: string): Promise<Employee> { return (await this.request('/session', 'POST', { email, password })).employee }
    async session() { try { return (await this.request('/session')).employee } catch (e) { if (e instanceof DomainError && e.code === 'UNAUTHENTICATED') return null; throw e } }
    async logout() { await this.request('/session', 'DELETE') }
    async snapshot() { return this.request('/snapshot') }
    async searchColleagues(query: string, date: string): Promise<ColleagueStatus[]> { return this.request('/colleagues?' + new URLSearchParams({ query, date }).toString()) }
    async execute(command: Command) { return this.request('/commands', 'POST', command) }
    async resetDemo() { await this.request('/demo/reset', 'POST', {}) }
}

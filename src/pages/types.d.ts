import type { Command, CommandResult, Database, Employee } from '../domain/types';

export interface PageProps {
  db: Database;
  actor: Employee;
  run: (c: Command) => Promise<CommandResult>;
  reload: () => Promise<void>;
}

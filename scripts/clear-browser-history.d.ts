export function clearIndexedDbHistory(
  factory: IDBFactory,
): Promise<{ before: number; after: number }>;
export function clearBrowserHistory(): Promise<{ before: number; after: number }>;

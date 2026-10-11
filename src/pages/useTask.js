import { useState } from 'react';

export function useTask(run) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function perform(command, done) {
    setBusy(true);
    setError('');
    try {
      const r = await run(command);
      done?.(r.id);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, perform };
}

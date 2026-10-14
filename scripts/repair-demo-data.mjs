import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { repairDemoRecords } from './demo-repair.js';

const apply = process.argv.includes('--apply');
for (const relative of [
  'server/data/leave-management-go.json',
  'server/data/leave-management-10-people.json',
]) {
  const path = resolve(relative);
  let original;
  try {
    original = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const result = repairDemoRecords(JSON.parse(original));
  if (apply) {
    await writeFile(`${path}.before-spec-${Date.now()}.bak`, original, { flag: 'wx' });
    const temp = `${path}.spec.tmp`;
    await writeFile(temp, JSON.stringify(result.database, null, 2) + '\n');
    await rename(temp, path);
  }
  console.log(
    JSON.stringify({
      file: relative,
      replacedRequestIds: result.replacedRequestIds,
      applied: apply,
      otherRecords: 'preserved',
    }),
  );
}

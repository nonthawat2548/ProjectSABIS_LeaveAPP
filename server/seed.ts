import { reset, databasePath } from './store';
if (!process.argv.includes('--confirm')) {
  console.log('This replaces the local mock JSON database. Run: npm run seed -- --confirm');
  process.exit(1);
}
await reset();
console.log(`Demo data saved: ${databasePath}`);

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
try{process.loadEnvFile('.env')}catch(e){if(e.code!=='ENOENT')throw e}
// Starts both processes without shell quoting; works on Windows, macOS and Linux.
const node=process.execPath;
const api=spawn(node,['--import','tsx',process.argv.includes('--cloud')?'server/cloud-dev.ts':'server/index.ts'],{stdio:'inherit',env:process.env});
const web=spawn(node,[resolve('node_modules/vite/bin/vite.js'),'--host','0.0.0.0'],{stdio:'inherit',env:{...process.env,VITE_DATA_MODE:'api'}});
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;api.kill();web.kill();setTimeout(()=>process.exit(code),250)}
api.on('exit',code=>stop(code??0));web.on('exit',code=>stop(code??0));process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());

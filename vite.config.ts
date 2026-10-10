import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'');
 return {
  plugins: [react()],
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.MOCK_PORT||env.MOCK_PORT||3001}`, changeOrigin: true } } },
 };
});

const {spawnSync}=require('node:child_process');const path=require('node:path');
const r=spawnSync('docker',['compose','--env-file','ms-users/.env',...process.argv.slice(2)],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;

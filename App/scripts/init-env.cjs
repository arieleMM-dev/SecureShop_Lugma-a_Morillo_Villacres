const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),auth=path.join(root,'ms-users'),stego=path.join(root,'ms-stego');
const r=spawnSync(process.execPath,['scripts/init-env.cjs'],{cwd:auth,stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);
const dotenv=require(path.join(auth,'node_modules/dotenv'));
const source=dotenv.parse(fs.readFileSync(path.join(auth,'.env')));
const file=path.join(stego,'.env');
let text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):fs.readFileSync(path.join(stego,'.env.example'),'utf8');
for(const [key,value] of Object.entries({AUTH_SERVICE_TOKEN:source.STEGO_SERVICE_TOKEN,AUTH_JWT_ISSUER:source.JWT_ISSUER,AUTH_JWT_AUDIENCE:source.JWT_AUDIENCE})) {
 const pattern=new RegExp('^'+key+'=.*$','m');text=pattern.test(text)?text.replace(pattern,key+'='+value):text+'\n'+key+'='+value;
}
fs.writeFileSync(file,text,{mode:0o600});fs.mkdirSync(path.join(stego,'secrets'),{recursive:true});
for(const [src,dst] of [[source.JWT_PUBLIC_KEY_PATH,'jwt-public.pem'],['secrets/ca.crt','ca.crt']]) {
 const target=path.join(stego,'secrets',dst);
 fs.copyFileSync(path.resolve(auth,src),target);
 // Material público: el UID no root del contenedor debe poder leerlo también en Linux.
 fs.chmodSync(target,0o644);
}
console.log('STEGO configurado exclusivamente con clave pública, CA y credencial de servicio; sin acceso a claves privadas ni credenciales de PostgreSQL.');

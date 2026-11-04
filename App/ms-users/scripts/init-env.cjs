const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, generateKeyPairSync } = require('node:crypto');
const { spawnSync } = require('node:child_process');
if (!fs.existsSync('.env')) fs.copyFileSync('.env.example', '.env');
let text = fs.readFileSync('.env', 'utf8');
const defaults = {
  DB_PASSWORD: randomBytes(24).toString('base64url'),
  STEGO_SERVICE_TOKEN: randomBytes(32).toString('hex'),
  SEED_PASSWORD: randomBytes(24).toString('base64url'),
  JWT_PRIVATE_KEY_PATH: 'secrets/jwt-private.pem',
  JWT_PUBLIC_KEY_PATH: 'secrets/jwt-public.pem',
  AUTH_TLS_CERT_PATH: 'secrets/auth-tls.crt',
  AUTH_TLS_KEY_PATH: 'secrets/auth-tls.key',
  AUTH_INTERNAL_PORT: '3443',
  JWT_EXPIRES_IN_SECONDS: '900',
  JWT_ISSUER: 'auth-service',
  JWT_AUDIENCE: 'chat-backend',
};
for (const [key, value] of Object.entries(defaults)) {
  const pattern = new RegExp('^' + key + '=.*$', 'm');
  if (!pattern.test(text)) text += '\n' + key + '=' + value;
  else if (new RegExp('^' + key + '=(?:|CHANGE_ME[^\r\n]*)$', 'm').test(text))
    text = text.replace(pattern, key + '=' + value);
}
fs.writeFileSync('.env', text + '\n', { mode: 0o600 });
const env = require('dotenv').parse(text);
const secretDir = 'secrets';
fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });
function save(file, value) {
  fs.writeFileSync(file, value, { mode: 0o600 });
}
const privatePath = env.JWT_PRIVATE_KEY_PATH,
  publicPath = env.JWT_PUBLIC_KEY_PATH;
if (!fs.existsSync(privatePath) && !fs.existsSync(publicPath)) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 3072,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  save(privatePath, keys.privateKey);
  save(publicPath, keys.publicKey);
} else if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath))
  throw new Error(
    'Par de claves JWT incompleto; revisar sin sobrescribir las claves existentes',
  );
if (
  !fs.existsSync(env.AUTH_TLS_CERT_PATH) ||
  !fs.existsSync(env.AUTH_TLS_KEY_PATH)
) {
  let openssl = process.env.OPENSSL_PATH || 'openssl';
  if (process.platform === 'win32' && !process.env.OPENSSL_PATH) {
    const bundled = 'C:/Program Files/Git/usr/bin/openssl.exe';
    if (fs.existsSync(bundled)) openssl = bundled;
  }
  const run = (args) => {
    const r = spawnSync(openssl, args, { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0)
      throw new Error(
        'OpenSSL requerido para TLS local; configurar OPENSSL_PATH. No se publicaron secretos.',
      );
  };
  if (!fs.existsSync('secrets/ca.key') || !fs.existsSync('secrets/ca.crt')) {
    run([
      'req',
      '-x509',
      '-newkey',
      'rsa:3072',
      '-nodes',
      '-keyout',
      'secrets/ca.key',
      '-out',
      'secrets/ca.crt',
      '-days',
      '30',
      '-subj',
      '/CN=AUTH Local Development CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ]);
  }
  run([
    'req',
    '-new',
    '-newkey',
    'rsa:3072',
    '-nodes',
    '-keyout',
    env.AUTH_TLS_KEY_PATH,
    '-out',
    'secrets/auth-tls.csr',
    '-subj',
    '/CN=auth',
  ]);
  save(
    'secrets/auth-tls.ext',
    'subjectAltName=DNS:auth,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n',
  );
  run([
    'x509',
    '-req',
    '-in',
    'secrets/auth-tls.csr',
    '-CA',
    'secrets/ca.crt',
    '-CAkey',
    'secrets/ca.key',
    '-CAcreateserial',
    '-out',
    env.AUTH_TLS_CERT_PATH,
    '-days',
    '30',
    '-extfile',
    'secrets/auth-tls.ext',
  ]);
}
for (const file of [
  '.env',
  privatePath,
  env.AUTH_TLS_KEY_PATH,
  'secrets/ca.key',
]) {
  if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
}
console.log(
  'Configuración, par RSA y TLS local preparados. Los secretos existentes se conservan. Revisar .env; no compartir secrets/ ni desactivar validación TLS.',
);

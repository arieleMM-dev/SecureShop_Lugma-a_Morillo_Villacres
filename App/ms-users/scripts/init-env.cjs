const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
if (!fs.existsSync('.env')) fs.copyFileSync('example.env.dist', '.env');
let text = fs.readFileSync('.env', 'utf8');
const defaults = {
  DB_PASSWORD: randomBytes(24).toString('base64url'),
  JWT_SECRET: randomBytes(48).toString('hex'),
  JWT_EXPIRES_IN_SECONDS: '900',
  JWT_ISSUER: 'user-service',
  JWT_AUDIENCE: 'secure-shop-api',
  SEED_PASSWORD: randomBytes(24).toString('base64url'),
};
for (const [key, value] of Object.entries(defaults)) {
  const pattern = new RegExp('^' + key + '=.*$', 'm');
  if (!pattern.test(text)) text += '\n' + key + '=' + value;
  else if (new RegExp('^' + key + '=(?:|CHANGE_ME[^\r\n]*)$', 'm').test(text))
    text = text.replace(pattern, key + '=' + value);
}
fs.writeFileSync('.env', text + '\n');
console.log(
  '.env preparado. Revisar DB_* y SEED_PASSWORD localmente; no subir este archivo.',
);

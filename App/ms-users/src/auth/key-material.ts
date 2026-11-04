import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
export function loadJwtKeys(privatePath: string, publicPath: string) {
  const privateKey = readFileSync(privatePath);
  const publicKey = readFileSync(publicPath);
  const key = createPrivateKey(privateKey);
  const pub = createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== 'rsa' ||
    pub.asymmetricKeyType !== 'rsa' ||
    (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw new Error('JWT requiere RSA de al menos 3072 bits');
  if (
    createPublicKey(key).export({ type: 'spki', format: 'pem' }) !==
    pub.export({ type: 'spki', format: 'pem' })
  )
    throw new Error('Las claves JWT no forman un par');
  return { privateKey, publicKey };
}

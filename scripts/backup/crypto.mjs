import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, open, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

// Format v1: authenticated magic + salt(32) + nonce(12), ciphertext, GCM tag(16).
const magic = Buffer.from('INTER-CLUB-BACKUP-1\n');
const headerLength = magic.length + 32 + 12;
function key(password, salt) {
  if (typeof password !== 'string' || password.length < 32) throw new Error('La contraseña de la copia debe tener al menos 32 caracteres; usa una generada por tu gestor de contraseñas.');
  return pbkdf2Sync(password, salt, 600000, 32, 'sha256');
}
async function decoder(input, password) {
  const size = (await stat(input)).size;
  if (size < headerLength + 16) throw new Error('La copia está incompleta.');
  const handle = await open(input, 'r');
  const header = Buffer.alloc(headerLength), tag = Buffer.alloc(16);
  try { await handle.read(header, 0, header.length, 0); await handle.read(tag, 0, 16, size - 16); } finally { await handle.close(); }
  if (!header.subarray(0, magic.length).equals(magic)) throw new Error('Formato de copia no reconocido.');
  const cipher = createDecipheriv('aes-256-gcm', key(password, header.subarray(magic.length, magic.length + 32)), header.subarray(-12));
  cipher.setAAD(header); cipher.setAuthTag(tag);
  return { cipher, size };
}
export async function encryptFile(input, output, password) {
  const salt = randomBytes(32), nonce = randomBytes(12), header = Buffer.concat([magic, salt, nonce]);
  const cipher = createCipheriv('aes-256-gcm', key(password, salt), nonce); cipher.setAAD(header);
  const partial = output + '.partial';
  let created = false;
  try {
    const handle = await open(partial, 'wx', 0o600); created = true; try { await handle.writeFile(header); } finally { await handle.close(); }
    await pipeline(createReadStream(input), cipher, createWriteStream(partial, { flags: 'a', mode: 0o600 }));
    const tail = await open(partial, 'a'); try { await tail.writeFile(cipher.getAuthTag()); } finally { await tail.close(); }
    await link(partial, output); await rm(partial);
  } catch { if (created) await rm(partial, { force: true }); throw new Error('No se pudo cifrar la copia.'); }
}
export async function decryptFile(input, output, password) {
  const partial = output + '.partial';
  let created = false;
  try {
    const { cipher, size } = await decoder(input, password);
    const handle = await open(partial, 'wx', 0o600); created = true;
    await pipeline(createReadStream(input, { start: headerLength, end: size - 17 }), cipher, handle.createWriteStream());
    await link(partial, output); await rm(partial);
  } catch { if (created) await rm(partial, { force: true }); throw new Error('No se pudo abrir la copia: contraseña incorrecta, archivo dañado o destino no disponible.'); }
}

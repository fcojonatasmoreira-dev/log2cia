import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export async function hashSenha(senha) {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(senha, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verificarSenha(senha, armazenada) {
  if (typeof armazenada !== 'string') return false;
  const partes = armazenada.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, custo, bloco, paralelismo, saltTexto, hashTexto] = partes;
  const N = Number(custo);
  const r = Number(bloco);
  const p = Number(paralelismo);
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0 ||
      !Number.isInteger(r) || r < 1 || r > 32 ||
      !Number.isInteger(p) || p < 1 || p > 16) return false;
  try {
    const salt = Buffer.from(saltTexto, 'base64url');
    const esperado = Buffer.from(hashTexto, 'base64url');
    if (salt.length !== SALT_LENGTH || esperado.length !== KEY_LENGTH) return false;
    const recebido = await scrypt(senha, salt, esperado.length, {
      N, r, p, maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(esperado, recebido);
  } catch {
    return false;
  }
}

export function pareceHashSenha(valor) {
  return typeof valor === 'string' && valor.startsWith('scrypt$');
}

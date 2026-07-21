// ============================================================================
// src/lib/moidian/signing.ts — با تشخیص خودکار هدر PEM
// ============================================================================

import crypto from 'crypto'

export function generateRSAKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey, privateKey }
}

/**
 * ★★★ نرمال‌سازی و ترمیم کلید PEM
 * اگر کلید فقط base64 است (بدون هدر)، هدر PEM را اضافه می‌کند
 */
function normalizePemFormat(privateKey: string): string {
  if (!privateKey) return ''

  let key = privateKey.trim()

  // ★ اگر هدر PEM دارد، همان را برمی‌گردانیم
  if (key.includes('-----BEGIN')) {
    return key
  }

  // ★★★ اگر فقط base64 است، هدر PEM را اضافه می‌کنیم
  // حذف تمام whitespace ها و line break ها
  const base64Content = key.replace(/\s+/g, '')

  // تبدیل به فرمت PEM استاندارد (۶۴ کاراکتر در هر خط)
  const lines: string[] = []
  for (let i = 0; i < base64Content.length; i += 64) {
    lines.push(base64Content.substring(i, i + 64))
  }

  const pem = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`

  console.log('[Moidian Sign] ✅ Reconstructed PEM header. Base64 length:', base64Content.length)

  return pem
}

export function signJWT(
  privateKeyPem: string,
  clientId: string,
  audience: string = 'sandbox.tax.gov.ir'
): string {
  const header = { typ: 'JWT', alg: 'RS256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: audience,
    exp: now + 3600,
    iat: now,
    jti: crypto.randomUUID(),
  }

  const base64UrlEncode = (obj: any): string => {
    const json = JSON.stringify(obj)
    return Buffer.from(json)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  const headerEncoded = base64UrlEncode(header)
  const payloadEncoded = base64UrlEncode(payload)
  const dataToSign = `${headerEncoded}.${payloadEncoded}`

  // ★★★ ترمیم کلید اگر هدر PEM ندارد
  const normalizedKey = normalizePemFormat(privateKeyPem)

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(dataToSign, 'utf8')
  signer.end()

  let signature: string

  // ★★★ روش ۱: استفاده از createPrivateKey
  try {
    const privateKeyObj = crypto.createPrivateKey({
      key: normalizedKey,
      format: 'pem',
    })
    signature = signer.sign(privateKeyObj, 'base64')
    console.log('[Moidian Sign] ✅ Method 1 (KeyObject) succeeded')
    return `${dataToSign}.${signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`
  } catch (err1: any) {
    console.warn('[Moidian Sign] Method 1 (KeyObject) failed:', err1.message)
  }

  // ★★★ روش ۲: استفاده مستقیم از PEM string
  try {
    const signer2 = crypto.createSign('RSA-SHA256')
    signer2.update(dataToSign, 'utf8')
    signer2.end()
    signature = signer2.sign(normalizedKey, 'base64')
    console.log('[Moidian Sign] ✅ Method 2 (PEM string) succeeded')
    return `${dataToSign}.${signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`
  } catch (err2: any) {
    console.error('[Moidian Sign] Method 2 (PEM string) failed:', err2.message)
  }

  // ★★★ اگر همه روش‌ها fail شدند
  throw new Error(
    `امضای JWT ناموفق بود. کلید: طول=${normalizedKey.length}, ` +
    `شروع با BEGIN=${normalizedKey.startsWith('-----BEGIN')}, ` +
    `خط اول="${normalizedKey.split('\n')[0]}". ` +
    `خطا: ${err2?.message || 'unknown'}`
  )
}

export function verifyJWT(jwt: string, publicKeyPem: string): any | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null

    const [headerEncoded, payloadEncoded, signatureEncoded] = parts
    const dataToVerify = `${headerEncoded}.${payloadEncoded}`

    const signature = signatureEncoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(signatureEncoded.length + (4 - (signatureEncoded.length % 4)) % 4, '=')

    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(dataToVerify, 'utf8')
    verifier.end()

    const publicKeyObj = crypto.createPublicKey({
      key: publicKeyPem,
      format: 'pem',
    })

    const isValid = verifier.verify(publicKeyObj, signature, 'base64')
    if (!isValid) return null

    const payloadJson = Buffer.from(
      payloadEncoded.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')

    return JSON.parse(payloadJson)
  } catch (err) {
    console.error('[Moidian Sign] JWT verification failed:', err)
    return null
  }
}

export function validatePrivateKeyPem(privateKeyPem: string): boolean {
  try {
    const normalized = normalizePemFormat(privateKeyPem)
    crypto.createPrivateKey({
      key: normalized,
      format: 'pem',
    })
    return true
  } catch {
    return false
  }
}

export function validateFiscalId(fiscalId: string): boolean {
  return /^\d{11}$/.test(fiscalId)
}

export function validateEconomicCode(economicCode: string): boolean {
  return /^\d{12}$/.test(economicCode)
}

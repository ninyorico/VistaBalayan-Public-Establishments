import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export const sendJson = json

export const readBody = async (req) => {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error('Invalid request body.'), { statusCode: 400 }) }
}

export const normalizeEmail = (email = '') => String(email).trim().toLowerCase()

export const validEmail = (email) => /^\S+@[^\s@]+\.[^\s@]+$/i.test(email)

const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing server environment variable: ${name}`)
  return value
}

export const getSupabaseAdmin = () => createClient(
  process.env.SUPABASE_URL || requiredEnv('VITE_SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export const findAuthUserByEmail = async (admin, email) => {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const user = data?.users?.find((candidate) => normalizeEmail(candidate.email) === email)
    if (user) return user
    if (!data?.users || data.users.length < 100) break
  }
  return null
}

const hashOtp = (email, code, purpose) => crypto
  .createHash('sha256')
  .update(`${purpose}:${email}:${code}:${requiredEnv('OTP_HASH_SECRET')}`)
  .digest('hex')

export const generateOtp = () => String(crypto.randomInt(100000, 1000000))

export const storeOtp = async (admin, { email, code }) => {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
  const purpose = 'public_signup'
  await admin.from('email_otps').update({ consumed_at: now.toISOString() })
    .eq('email', email).eq('purpose', purpose).is('consumed_at', null)
  const { error } = await admin.from('email_otps').insert({
    email, purpose, otp_hash: hashOtp(email, code, purpose), expires_at: expiresAt, metadata: {},
  })
  if (error) throw error
}

export const consumeOtp = async (admin, { email, code }) => {
  const purpose = 'public_signup'
  const now = new Date().toISOString()
  const { data, error } = await admin.from('email_otps')
    .select('id, attempts').eq('email', email).eq('purpose', purpose)
    .eq('otp_hash', hashOtp(email, code, purpose)).is('consumed_at', null)
    .gt('expires_at', now).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!data) throw Object.assign(new Error('Invalid or expired verification code.'), { statusCode: 401 })
  const { error: consumeError } = await admin.from('email_otps').update({
    consumed_at: now, attempts: Number(data.attempts || 0) + 1,
  }).eq('id', data.id).is('consumed_at', null)
  if (consumeError) throw consumeError
}

const getClientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
const rateLimits = new Map()

export const enforceRateLimit = (req, email, action) => {
  const key = `${action}:${email}:${getClientIp(req)}`
  const now = Date.now()
  const current = rateLimits.get(key)
  if (!current || now - current.startedAt >= 10 * 60 * 1000) {
    rateLimits.set(key, { startedAt: now, count: 1 })
    return
  }
  const limit = action === 'send' ? 3 : 10
  if (current.count >= limit) throw Object.assign(new Error('Too many verification attempts. Please try again later.'), { statusCode: 429 })
  current.count += 1
}

export const sendOtpEmail = async (to, code) => {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: requiredEnv('EMAILJS_SERVICE_ID'),
      template_id: requiredEnv('EMAILJS_TEMPLATE_ID'),
      user_id: requiredEnv('EMAILJS_PUBLIC_KEY'),
      ...(process.env.EMAILJS_PRIVATE_KEY ? { accessToken: process.env.EMAILJS_PRIVATE_KEY } : {}),
      template_params: {
        to_email: to,
        email: to,
        otp_code: code,
        code,
        name: process.env.EMAILJS_FROM_NAME || 'VistaBalayan',
        expires_in: '10 minutes',
        purpose: 'Public Account Verification',
        subject: `${code} is your VistaBalayan verification code`,
      },
    }),
  })
  if (!response.ok) throw new Error(`EmailJS failed to send the verification email (${response.status}).`)
}

import {
  consumeOtp,
  enforceRateLimit,
  findAuthUserByEmail,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  sendJson,
  validEmail,
} from './_utils/publicSignup.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    const code = String(body.code || '').trim()
    if (!validEmail(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' })
    if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' })
    if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: 'Enter the 6-digit verification code.' })
    enforceRateLimit(req, email, 'verify')
    const admin = getSupabaseAdmin()
    if (await findAuthUserByEmail(admin, email)) {
      return sendJson(res, 409, { error: 'An account already exists for this email. Use Sign in or Forgot password instead.' })
    }
    await consumeOtp(admin, { email, code })
    const displayName = email.split('@')[0].slice(0, 80)
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, full_name: displayName, name: displayName },
    })
    if (error) {
      if (/already been registered|already exists|duplicate/i.test(error.message || '')) {
        return sendJson(res, 409, { error: 'An account already exists for this email. Use Sign in or Forgot password instead.' })
      }
      throw error
    }
    return sendJson(res, 200, { ok: true, userId: data.user?.id || null })
  } catch (error) {
    console.error('public-signup-verify-otp failed', error)
    return sendJson(res, error?.statusCode || 500, { error: error?.message || 'Unable to verify the account.' })
  }
}

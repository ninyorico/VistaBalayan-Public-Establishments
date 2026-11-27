import {
  enforceRateLimit,
  findAuthUserByEmail,
  generateOtp,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  sendJson,
  sendOtpEmail,
  storeOtp,
  validEmail,
} from './_utils/publicSignup.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' })
  try {
    const body = await readBody(req)
    const email = normalizeEmail(body.email)
    const password = String(body.password || '')
    if (!validEmail(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' })
    if (password.length < 6) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' })
    enforceRateLimit(req, email, 'send')
    const admin = getSupabaseAdmin()
    if (await findAuthUserByEmail(admin, email)) {
      return sendJson(res, 409, { error: 'An account already exists for this email. Use Sign in or Forgot password instead.' })
    }
    const code = generateOtp()
    await storeOtp(admin, { email, code })
    try {
      await sendOtpEmail(email, code)
    } catch (error) {
      await admin.from('email_otps').update({ consumed_at: new Date().toISOString() })
        .eq('email', email).eq('purpose', 'public_signup').is('consumed_at', null)
      throw error
    }
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    console.error('public-signup-send-otp failed', error)
    return sendJson(res, error?.statusCode || 500, { error: error?.message || 'Unable to send a verification code.' })
  }
}

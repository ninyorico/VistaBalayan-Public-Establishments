import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL_NAME = 'models/gemini-2.5-flash'
const MAX_CANDIDATES = 3
const MAX_TEXT_LENGTH = 700

const cleanString = (value, fallback = '') =>
  String(value ?? fallback)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH)

const cleanReason = (value, fallback) => {
  const cleaned = cleanString(value)
    .replace(/[*_`#>\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return fallback
  if (cleaned.length <= 180) return cleaned
  return `${cleaned.slice(0, 177).trim()}...`
}

const clampNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const extractJsonObject = (text) => {
  const match = String(text || '').match(/\{[\s\S]*\}/)
  if (!match) return null
  return JSON.parse(match[0])
}

const normalizeCandidate = (candidate) => ({
  id: cleanString(candidate?.id).slice(0, 120),
  name: cleanString(candidate?.name, 'Tourism establishment'),
  category: cleanString(candidate?.category, 'Tourism establishment').slice(0, 80),
  address: cleanString(candidate?.address),
  description: cleanString(candidate?.description),
  distanceKm: typeof candidate?.distance === 'number' ? Number(candidate.distance.toFixed(1)) : null,
  rating: clampNumber(candidate?.rating),
  ratingCount: clampNumber(candidate?.ratingCount),
  signals: {
    searchMatched: Boolean(candidate?.searchMatched),
    categoryInterest: Boolean(candidate?.categoryInterest),
    previouslyViewed: Boolean(candidate?.previouslyViewed),
    featured: Boolean(candidate?.featured),
  },
  fallbackReason: cleanString(candidate?.fallbackReason, 'Recommended from your browsing pattern and Balayan travel interests.'),
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    return res.status(200).json({ recommendations: [], source: 'fallback' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const candidates = Array.isArray(body.candidates)
      ? body.candidates.slice(0, MAX_CANDIDATES).map(normalizeCandidate).filter((candidate) => candidate.id)
      : []

    if (candidates.length === 0) {
      return res.status(200).json({ recommendations: [], source: 'fallback' })
    }

    const context = {
      searchTerm: cleanString(body.context?.searchTerm).slice(0, 120),
      selectedCategory: cleanString(body.context?.selectedCategory, 'all').slice(0, 80),
      hasUserLocation: Boolean(body.context?.hasUserLocation),
      recentSearches: Array.isArray(body.context?.recentSearches)
        ? body.context.recentSearches.map((item) => cleanString(item).slice(0, 80)).filter(Boolean).slice(0, 5)
        : [],
    }

    const prompt = `
You are VistaBalayan's public tourism recommendation assistant for Balayan, Batangas.
Write short visitor-friendly AI-assisted explanations for why each resort or hotel is recommended.
Use only the provided data. Do not invent amenities, prices, availability, booking details, or unsupported claims.
Mention location/distance only when distanceKm is not null.
Keep each reason one sentence, 12 to 24 words, warm and specific.

Visitor context:
${JSON.stringify(context, null, 2)}

Candidates:
${JSON.stringify(candidates.map(({ fallbackReason, ...candidate }) => candidate), null, 2)}

Return ONLY valid JSON in this exact shape:
{
  "recommendations": [
    { "id": "candidate id", "reason": "one concise explanation" }
  ]
}
`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })
    const result = await model.generateContent(prompt)
    const responseText = await result.response.text()
    const parsed = extractJsonObject(responseText)

    const recommendations = []
    for (const item of parsed?.recommendations || []) {
      const candidate = candidates.find((entry) => entry.id === item?.id)
      if (!candidate) continue
      recommendations.push({
        id: candidate.id,
        reason: cleanReason(item.reason, candidate.fallbackReason),
      })
    }

    return res.status(200).json({ recommendations, source: 'gemini', model: MODEL_NAME })
  } catch (error) {
    console.warn('Gemini public recommendations failed:', error?.message || error)
    return res.status(200).json({ recommendations: [], source: 'fallback' })
  }
}

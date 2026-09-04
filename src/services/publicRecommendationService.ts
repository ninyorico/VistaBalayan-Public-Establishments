import { GoogleGenerativeAI } from '@google/generative-ai'

const MODEL_NAME = 'models/gemini-2.5-flash'
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ''
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null

export interface PublicRecommendationCandidate {
  id: string
  name: string
  category: string
  address?: string | null
  description?: string | null
  distance?: number | null
  rating?: number | null
  ratingCount?: number | null
  searchMatched?: boolean
  categoryInterest?: boolean
  previouslyViewed?: boolean
  featured?: boolean
  fallbackReason: string
}

export interface PublicRecommendationContext {
  searchTerm?: string
  selectedCategory?: string
  hasUserLocation: boolean
  recentSearches: string[]
}

const cleanReason = (value: unknown, fallback: string) => {
  const cleaned = String(value || '')
    .replace(/[*_`#>\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return fallback
  if (cleaned.length <= 180) return cleaned
  return `${cleaned.slice(0, 177).trim()}...`
}

const extractJsonObject = (text: string) => {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  return JSON.parse(match[0]) as { recommendations?: Array<{ id?: string; reason?: string }> }
}

export async function generatePublicRecommendationExplanations(
  candidates: PublicRecommendationCandidate[],
  context: PublicRecommendationContext,
): Promise<Record<string, string>> {
  if (!genAI || candidates.length === 0) return {}

  const compactCandidates = candidates.slice(0, 3).map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    category: candidate.category,
    address: candidate.address || '',
    description: candidate.description || '',
    distanceKm: typeof candidate.distance === 'number' ? Number(candidate.distance.toFixed(1)) : null,
    rating: candidate.rating,
    ratingCount: candidate.ratingCount,
    signals: {
      searchMatched: candidate.searchMatched,
      categoryInterest: candidate.categoryInterest,
      previouslyViewed: candidate.previouslyViewed,
      featured: candidate.featured,
    },
  }))

  const prompt = `
You are VistaBalayan's public tourism recommendation assistant for Balayan, Batangas.
Write short visitor-friendly AI-assisted explanations for why each resort or hotel is recommended.
Use only the provided data. Do not invent amenities, prices, availability, or booking details.
Mention location/distance only when distanceKm is not null.
Keep each reason one sentence, 12 to 24 words, warm and specific.

Visitor context:
${JSON.stringify(context, null, 2)}

Candidates:
${JSON.stringify(compactCandidates, null, 2)}

Return ONLY valid JSON in this exact shape:
{
  "recommendations": [
    { "id": "candidate id", "reason": "one concise explanation" }
  ]
}
`

  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME })
    const result = await model.generateContent(prompt)
    const responseText = await result.response.text()
    const parsed = extractJsonObject(responseText)
    const explanations: Record<string, string> = {}

    for (const item of parsed?.recommendations || []) {
      const candidate = candidates.find((entry) => entry.id === item.id)
      if (!candidate || !item.id) continue
      explanations[item.id] = cleanReason(item.reason, candidate.fallbackReason)
    }

    return explanations
  } catch (error) {
    console.warn('Gemini public recommendation explanation failed:', error)
    return {}
  }
}

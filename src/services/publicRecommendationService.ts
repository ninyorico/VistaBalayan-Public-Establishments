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

interface GeminiRecommendationResponse {
  recommendations?: Array<{ id?: string; reason?: string }>
  source?: 'gemini' | 'fallback'
  model?: string
}

const PUBLIC_RECOMMENDATION_ENDPOINT = '/api/public-recommendations'

const cleanReason = (value: unknown, fallback: string) => {
  const cleaned = String(value || '')
    .replace(/[*_`#>\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return fallback
  if (cleaned.length <= 180) return cleaned
  return `${cleaned.slice(0, 177).trim()}...`
}

export async function generatePublicRecommendationExplanations(
  candidates: PublicRecommendationCandidate[],
  context: PublicRecommendationContext,
): Promise<Record<string, string>> {
  if (candidates.length === 0) return {}

  try {
    const response = await fetch(PUBLIC_RECOMMENDATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidates: candidates.slice(0, 3),
        context,
      }),
    })

    if (!response.ok) return {}

    const payload = (await response.json()) as GeminiRecommendationResponse
    const explanations: Record<string, string> = {}

    for (const item of payload.recommendations || []) {
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

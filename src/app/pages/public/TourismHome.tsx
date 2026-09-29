import { useEffect, useMemo, useState } from 'react'
import {
  Bed,
  Building2,
  ChevronRight,
  Clock,
  Compass,
  Filter,
  Globe,
  Hotel,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Search,
  Sparkles,
  Star,
  X,
  ImagePlus,
} from 'lucide-react'
import React from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Input } from '../../components/ui/input'
import { Separator } from '../../components/ui/separator'
import { supabase } from '../../../lib/supabase'

interface Establishment {
  id: string
  name: string
  type: string
  dot_classification?: string | null
  address: string
  contact_number: string
  description: string
  images: string[]
  opening_hours: string
  website_url: string
  email: string
  amenities?: string
  featured?: boolean
  total_rooms?: number
  latitude?: number
  longitude?: number
}

interface RatingBreakdown {
  1: number
  2: number
  3: number
  4: number
  5: number
}

interface RatingSummary {
  average: number
  count: number
  breakdown: RatingBreakdown
  commentCount: number
  visitorRating?: number
}

interface RatingReview {
  establishment_id: string
  rating: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
  photo_path?: string | null
}

interface UserLocation {
  latitude: number
  longitude: number
}

interface BehaviorProfile {
  viewedIds: string[]
  categoryClicks: Record<string, number>
  searches: string[]
}

const BEHAVIOR_KEY = 'vistabalayan_public_behavior_v1'
const RATING_VISITOR_KEY = 'vistabalayan_public_rating_visitor_v1'
const REVIEWER_NAME_KEY = 'vistabalayan_public_reviewer_name_v1'
const LEGACY_LOCAL_RATINGS_KEY = 'vistabalayan_public_local_ratings_v1'
const LEGACY_REVIEW_PREFIX = 'Reviewed by '
const emptyBreakdown: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }

const createEmptyRatingSummary = (): RatingSummary => ({ average: 0, count: 0, breakdown: { ...emptyBreakdown }, commentCount: 0 })
const emptyRatingSummary = createEmptyRatingSummary()
const INAPPROPRIATE_REVIEW_PATTERN = /(^|[^a-z0-9])(asshole|bastard|bitch|bullshit|cunt|dick|fuck|fucker|motherfucker|nigger|piss|porn|shit|slut|whore|putang\s*ina|tangina|tanga|gago|gaga|napakagago|napakagaga|ulol|tarantado|leche|lecheng|pakyu|burat|kantot|iyot)([^a-z0-9]|$)/i

const categories = [
  { id: 'all', name: 'All stays', icon: Search },
  { id: 'Resort', name: 'Resorts', icon: Hotel },
  { id: 'Hotel', name: 'Hotels', icon: Building2 },
]

const emptyBehavior: BehaviorProfile = {
  viewedIds: [],
  categoryClicks: {},
  searches: [],
}

const getPublicCategory = (type = '', dotClassification: string | null = '') => {
  const normalizedType = type.toLowerCase()
  const normalizedClass = String(dotClassification || '').toLowerCase().trim()
  const isResort = normalizedClass === 'res' || normalizedClass.includes('resort') || normalizedType.includes('resort') || normalizedType.includes('pool') || normalizedType.includes('farm')
  if (isResort) return 'Resort'

  const accommodationClasses = ['htl', 'apa', 'inn', 'pen', 'mot', 'eco', 'hms', 'cmp', 'oth']
  if (accommodationClasses.includes(normalizedClass) || normalizedClass.includes('hotel') || normalizedClass.includes('apartelle') || normalizedClass.includes('tourist inn') || normalizedClass.includes('pension') || normalizedClass.includes('motel') || normalizedClass.includes('eco-lodge') || normalizedClass.includes('home stay') || normalizedClass.includes('glamping')) return 'Hotel'
  if (normalizedType.includes('hotel') || normalizedType.includes('inn') || normalizedType.includes('lodge')) return 'Hotel'
  return null
}

const getCategoryIcon = (type: string, dotClassification: string | null = '') => {
  return getPublicCategory(type, dotClassification) === 'Hotel' ? Building2 : Hotel
}

const PUBLIC_LISTING_REAL_PINS: Record<string, UserLocation> = {
  'Altina Beach House Resort': { latitude: 13.9345996, longitude: 120.7362971 },
  'Aurora Resort': { latitude: 13.9455882, longitude: 120.711106 },
  'Espineli Inn and Pavilion': { latitude: 13.9407521, longitude: 120.7280871 },
  Henaida: { latitude: 13.9282729, longitude: 120.716604 },
  'Hotel Casa Ilustre': { latitude: 13.9504005, longitude: 120.7299843 },
  'Kalika Balayan': { latitude: 13.9511297, longitude: 120.6834398 },
  'King & Queen Resorts': { latitude: 13.9475094, longitude: 120.7091793 },
  'La Georgina Resorts': { latitude: 13.9444017, longitude: 120.7599171 },
  'La Jamayca Resort': { latitude: 13.9231998, longitude: 120.7076709 },
  'La Piscina Resort': { latitude: 13.9421314, longitude: 120.7397857 },
  'Magsino Chokdee Farm': { latitude: 13.9648288, longitude: 120.7624942 },
  'Malabanan Swimming Pool': { latitude: 13.9425817, longitude: 120.7362508 },
  'My Place Resort': { latitude: 13.9465681, longitude: 120.7501423 },
  'Palayan Inn': { latitude: 13.94481, longitude: 120.7105529 },
  'Soggiorno Lorenzana': { latitude: 13.9517933, longitude: 120.6822078 },
  'Soler Sea Resort': { latitude: 13.9299726, longitude: 120.7625559 },
  'Souq Salamanca': { latitude: 13.9454597, longitude: 120.6665522 },
  'Summer8 Resort': { latitude: 13.9447157, longitude: 120.7397152 },
  "Valentino's Hotel": { latitude: 13.9607313, longitude: 120.726657 },
  'Viktoria Garden Resort': { latitude: 13.9330076, longitude: 120.7221941 },
  'Villa Beadoy Resorts and Pavilion': { latitude: 13.9441293, longitude: 120.7403224 },
  'Villa Casa Mia': { latitude: 13.974437, longitude: 120.7632905 },
  'Villa Scarlet Garden Resort': { latitude: 13.94959, longitude: 120.6992248 },
}

const readLocationPinFromAmenities = (amenities = '') => {
  const match = amenities.match(/\[LOCATION_PIN:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/)
  if (!match) return null
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

const getStoredLocation = (establishment: Establishment) => {
  const latitude = Number(establishment.latitude)
  const longitude = Number(establishment.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude, longitude }
  }
  const amenitiesPin = readLocationPinFromAmenities(establishment.amenities || '')
  if (amenitiesPin) return amenitiesPin
  return PUBLIC_LISTING_REAL_PINS[establishment.name] || null
}

const hasExactLocation = (establishment: Establishment) => Boolean(getStoredLocation(establishment))

const getLocationQuery = (establishment: Establishment) => {
  const storedLocation = getStoredLocation(establishment)
  if (storedLocation) return `${storedLocation.latitude},${storedLocation.longitude}`
  return establishment.address || establishment.name
}

const getOpenStreetMapEmbedUrl = (establishment: Establishment) => {
  const storedLocation = getStoredLocation(establishment)
  if (!storedLocation) return `https://www.openstreetmap.org/export/embed.html?bbox=120.7132%2C13.9185%2C120.7532%2C13.9585&layer=mapnik`
  const { latitude, longitude } = storedLocation
  const delta = 0.006
  return `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`
}
const getGoogleMapsDirectionsUrl = (establishment: Establishment, origin?: UserLocation | null) => {
  const storedLocation = getStoredLocation(establishment)
  const destination = storedLocation
    ? `${storedLocation.latitude},${storedLocation.longitude}`
    : getLocationQuery(establishment)
  const originParam = origin ? `&origin=${origin.latitude},${origin.longitude}` : ''
  return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${encodeURIComponent(destination)}&travelmode=driving`
}
const readBehavior = (): BehaviorProfile => {
  if (typeof window === 'undefined') return emptyBehavior
  try {
    const stored = window.localStorage.getItem(BEHAVIOR_KEY)
    return stored ? { ...emptyBehavior, ...JSON.parse(stored) } : emptyBehavior
  } catch {
    return emptyBehavior
  }
}

const saveBehavior = (behavior: BehaviorProfile) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(BEHAVIOR_KEY, JSON.stringify(behavior))
}

const getRatingVisitorToken = () => {
  if (typeof window === 'undefined') return 'server-rendered-visitor'

  const existing = window.localStorage.getItem(RATING_VISITOR_KEY)
  if (existing) return existing

  const token = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(RATING_VISITOR_KEY, token)
  return token
}

const readReviewerName = () => {
  if (typeof window === 'undefined') return ''
  window.localStorage.removeItem(LEGACY_LOCAL_RATINGS_KEY)
  return window.localStorage.getItem(REVIEWER_NAME_KEY)?.trim() || ''
}

const saveReviewerName = (name: string) => {
  if (typeof window === 'undefined') return
  const trimmedName = name.trim()
  if (trimmedName) window.localStorage.setItem(REVIEWER_NAME_KEY, trimmedName)
}

const buildLegacyReviewComment = (reviewerName: string, comment: string) => {
  const prefix = `${LEGACY_REVIEW_PREFIX}${reviewerName.trim()}`.slice(0, 120)
  const trimmedComment = comment.trim()
  if (!trimmedComment) return prefix.slice(0, 500)
  return `${prefix}\n${trimmedComment}`.slice(0, 500)
}

const getReviewDisplay = (review: RatingReview) => {
  const reviewerName = review.reviewer_name?.trim()
  const comment = review.comment?.trim() || ''

  if (reviewerName) {
    return { reviewerName, comment }
  }

  if (comment.startsWith(LEGACY_REVIEW_PREFIX)) {
    const withoutPrefix = comment.slice(LEGACY_REVIEW_PREFIX.length)
    const [nameLine, ...commentLines] = withoutPrefix.split('\n')
    const legacyReviewerName = nameLine.trim()
    if (legacyReviewerName) {
      return {
        reviewerName: legacyReviewerName,
        comment: commentLines.join('\n').trim(),
      }
    }
  }

  return { reviewerName: 'Anonymous visitor', comment }
}

const sortReviewsForDisplay = (reviews: RatingReview[]) => {
  return [...reviews].sort((a, b) => {
    const aHasComment = getReviewDisplay(a).comment.length > 0
    const bHasComment = getReviewDisplay(b).comment.length > 0
    if (aHasComment !== bHasComment) return aHasComment ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

const summarizeRatings = (ratings: Array<{ establishment_id: string; average_rating: number; rating_count: number; one_star_count?: number; two_star_count?: number; three_star_count?: number; four_star_count?: number; five_star_count?: number; comment_count?: number }>) => {
  return ratings.reduce<Record<string, RatingSummary>>((acc, item) => {
    if (!item.establishment_id || typeof item.average_rating !== 'number') return acc

    acc[item.establishment_id] = {
      average: item.average_rating,
      count: item.rating_count || 0,
      breakdown: {
        1: item.one_star_count || 0,
        2: item.two_star_count || 0,
        3: item.three_star_count || 0,
        4: item.four_star_count || 0,
        5: item.five_star_count || 0,
      },
      commentCount: item.comment_count || 0,
    }
    return acc
  }, {})
}

const normalizeListingImages = (value: unknown): string[] => {
  let candidates: unknown[] = []
  if (Array.isArray(value)) {
    candidates = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        candidates = Array.isArray(parsed) ? parsed : []
      } catch {
        candidates = []
      }
    } else if (trimmed) {
      candidates = [trimmed]
    }
  }

  return Array.from(new Set(candidates.filter((image): image is string => {
    if (typeof image !== 'string' || !image.trim()) return false
    const normalized = image.trim()
    if (normalized.startsWith('data:image/')) return true
    try {
      const parsed = new URL(normalized)
      return parsed.protocol === 'https:' || parsed.protocol === 'http:'
    } catch {
      return false
    }
  }).map((image) => image.trim())))
}

const ListingPhoto = ({ sources, alt, className }: { sources: string[]; alt: string; className: string }) => {
  const [sourceIndex, setSourceIndex] = React.useState(0)
  React.useEffect(() => setSourceIndex(0), [sources])
  const source = sources[sourceIndex]
  if (!source) return null
  return <img src={source} alt={alt} className={className} referrerPolicy="no-referrer" onError={() => setSourceIndex((current) => current + 1)} />
}

const normalizePublicEstablishment = (establishment: Establishment): Establishment => ({
  ...establishment,
  images: normalizeListingImages(establishment.images),
})

export default function TourismHome() {
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [filtered, setFiltered] = useState<Establishment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null)
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [behavior, setBehavior] = useState<BehaviorProfile>(emptyBehavior)
  const [ratingSummaries, setRatingSummaries] = useState<Record<string, RatingSummary>>({})
  const [ratingVisitorToken, setRatingVisitorToken] = useState('')
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingMessage, setRatingMessage] = useState('')
  const [selectedReviewRating, setSelectedReviewRating] = useState(0)
  const [reviewerName, setReviewerName] = useState(readReviewerName())
  const [reviewComment, setReviewComment] = useState('')
  const [reviewPhoto, setReviewPhoto] = useState<File | null>(null)
  const [reviewPhotoPreview, setReviewPhotoPreview] = useState('')
  const [ratingReviews, setRatingReviews] = useState<Record<string, RatingReview[]>>({})
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null)
  const [routeDistances, setRouteDistances] = useState<Record<string, number>>({})
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'blocked'>('idle')
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [mobileDiscoveryPanel, setMobileDiscoveryPanel] = useState<'recommendations' | 'nearest' | null>(null)
  const [showSelectedMap, setShowSelectedMap] = useState(false)

  useEffect(() => {
    if (!mobileDiscoveryPanel) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileDiscoveryPanel(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileDiscoveryPanel])

  useEffect(() => {
    let cancelled = false

    if (!userLocation) {
      setRouteDistances({})
      setRouteStatus('idle')
      return () => { cancelled = true }
    }

    const destinations = establishments
      .map((est) => ({ establishment: est, coords: getStoredLocation(est) }))
      .filter((item): item is { establishment: Establishment; coords: UserLocation } => Boolean(item.coords))

    if (destinations.length === 0) {
      setRouteDistances({})
      setRouteStatus('ready')
      return () => { cancelled = true }
    }

    const controller = new AbortController()
    const routeTimeout = window.setTimeout(() => controller.abort(), 20000)

    setRouteStatus('loading')
    Promise.allSettled(
      destinations.map(async ({ establishment, coords }) => {
        const routeCoordinates = `${userLocation.longitude},${userLocation.latitude};${coords.longitude},${coords.latitude}`
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${routeCoordinates}?overview=false`, { signal: controller.signal })
        if (!response.ok) return null
        const result = await response.json() as { routes?: Array<{ distance?: number }> }
        const meters = result.routes?.[0]?.distance
        return typeof meters === 'number' && Number.isFinite(meters) ? [establishment.id, meters / 1000] as [string, number] : null
      })
    )
      .then((results) => {
        if (cancelled) return
        const validEntries = results
          .map((result) => result.status === 'fulfilled' ? result.value : null)
          .filter((entry): entry is [string, number] => Boolean(entry))
        setRouteDistances(Object.fromEntries(validEntries))
        setRouteStatus(validEntries.length > 0 ? 'ready' : 'error')
      })
      .catch(() => {
        if (!cancelled) {
          setRouteDistances({})
          setRouteStatus('error')
        }
      })
      .finally(() => window.clearTimeout(routeTimeout))

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(routeTimeout)
    }
  }, [establishments, userLocation])

  useEffect(() => {
    setBehavior(readBehavior())
    const visitorToken = getRatingVisitorToken()
    setRatingVisitorToken(visitorToken)
    fetchEstablishments(visitorToken)
  }, [])

  const fetchEstablishments = async (visitorToken = ratingVisitorToken) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .eq('status', 'active')
      .order('name')

    if (!error && data) {
      const publicStays = data.filter((est) => getPublicCategory(est.type, est.dot_classification)).map(normalizePublicEstablishment)
      setEstablishments(publicStays)
      setFiltered(publicStays)
      await fetchRatingSummaries(publicStays.map((est) => est.id), visitorToken)
    }
    setLoading(false)
  }

  const fetchRatingSummaries = async (establishmentIds: string[], visitorToken = ratingVisitorToken) => {
    if (establishmentIds.length === 0) return

    const { data, error } = await supabase
      .from('establishment_rating_summaries')
      .select('establishment_id, average_rating, rating_count, one_star_count, two_star_count, three_star_count, four_star_count, five_star_count, comment_count')
      .in('establishment_id', establishmentIds)

    if (!error && data) {
      setRatingSummaries((current) => ({
        ...current,
        ...summarizeRatings(data),
      }))
    }
  }

  const fetchRatingReviews = async (establishmentId: string) => {
    let { data, error } = await supabase
      .from('establishment_rating_reviews')
      .select('establishment_id, rating, comment, reviewer_name, photo_path, created_at')
      .eq('establishment_id', establishmentId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      const legacyResult = await supabase
        .from('establishment_rating_reviews')
        .select('establishment_id, rating, comment, created_at')
        .eq('establishment_id', establishmentId)
        .order('created_at', { ascending: false })
        .limit(50)
      data = (legacyResult.data || []).map((item) => ({ ...item, reviewer_name: null, photo_path: null }))
      error = legacyResult.error
    }

    if (!error && data) {
      setRatingReviews((current) => ({ ...current, [establishmentId]: sortReviewsForDisplay(data) }))
    }
  }

  const submitRating = async () => {
    if (!selectedEstablishment || submittingRating || selectedReviewRating < 1) return

    const visitorToken = ratingVisitorToken || getRatingVisitorToken()
    if (!ratingVisitorToken) setRatingVisitorToken(visitorToken)

    setSubmittingRating(true)
    setRatingMessage('')

    const name = reviewerName.trim()
    if (!name) {
      setRatingMessage('Please enter your name before submitting your review.')
      setSubmittingRating(false)
      return
    }

    const comment = reviewComment.trim()
    if (INAPPROPRIATE_REVIEW_PATTERN.test(`${name} ${comment}`)) {
      setRatingMessage('Please remove inappropriate language before submitting your review.')
      setSubmittingRating(false)
      return
    }

    let photoPath: string | null = null
    if (reviewPhoto) {
      const extension = reviewPhoto.name.split('.').pop()?.toLowerCase() || 'jpg'
      photoPath = `${selectedEstablishment.id}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('review-photos').upload(photoPath, reviewPhoto, {
        cacheControl: '3600',
        contentType: reviewPhoto.type,
        upsert: false,
      })
      if (uploadError) {
        setRatingMessage(`Photo upload failed: ${uploadError.message}`)
        setSubmittingRating(false)
        return
      }
    }

    const { error } = await supabase.rpc('submit_establishment_rating', {
      p_establishment_id: selectedEstablishment.id,
      p_visitor_token: visitorToken,
      p_rating: selectedReviewRating,
      p_comment: comment || null,
      p_reviewer_name: name,
      p_photo_path: photoPath,
    })

    saveReviewerName(name)

    if (error) {
      setRatingMessage('Your review could not be saved. Please try again.')
    } else {
      setRatingMessage('Thanks, your review was saved with your name.')
      setReviewComment('')
      setReviewPhoto(null)
      setReviewPhotoPreview('')
      await fetchRatingSummaries(establishments.map((est) => est.id), visitorToken)
      await fetchRatingReviews(selectedEstablishment.id)
    }

    setSubmittingRating(false)
  }

  useEffect(() => {
    let results = establishments
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      results = results.filter((e) =>
        e.name.toLowerCase().includes(term) ||
        e.address.toLowerCase().includes(term) ||
        getPublicCategory(e.type)?.toLowerCase().includes(term) ||
        (e.description && e.description.toLowerCase().includes(term))
      )
    }
    if (selectedType !== 'all') {
      results = results.filter((e) => getPublicCategory(e.type) === selectedType)
    }
    setFiltered(results)
  }, [searchTerm, selectedType, establishments])


  useEffect(() => {
    if (!searchTerm.trim()) return
    const handle = window.setTimeout(() => {
      const next = {
        ...behavior,
        searches: [searchTerm.trim(), ...behavior.searches.filter((s) => s !== searchTerm.trim())].slice(0, 8),
      }
      setBehavior(next)
      saveBehavior(next)
    }, 650)
    return () => window.clearTimeout(handle)
  }, [searchTerm])

  const handleCategoryChange = (category: string) => {
    setSelectedType(category)
    const next = {
      ...behavior,
      categoryClicks: {
        ...behavior.categoryClicks,
        [category]: (behavior.categoryClicks[category] || 0) + 1,
      },
    }
    setBehavior(next)
    saveBehavior(next)
  }

  const openDetails = (establishment: Establishment) => {
    setSelectedEstablishment(establishment)
    setSelectedPhotoIndex(0)
    setShowSelectedMap(false)
    setRatingMessage('')
    setSelectedReviewRating(ratingSummaries[establishment.id]?.visitorRating || 0)
    setReviewerName(readReviewerName())
    setReviewComment('')
    fetchRatingReviews(establishment.id)
    const next = {
      ...behavior,
      viewedIds: [establishment.id, ...behavior.viewedIds.filter((id) => id !== establishment.id)].slice(0, 12),
    }
    setBehavior(next)
    saveBehavior(next)
  }

  const getMobileFriendlyLocation = (
    onSuccess: (location: UserLocation) => void,
    onError: () => void,
  ) => {
    if (!navigator.geolocation) {
      onError()
      return
    }

    const handleSuccess = (position: GeolocationPosition) => {
      onSuccess({ latitude: position.coords.latitude, longitude: position.coords.longitude })
    }

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      () => {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          onError,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    )
  }

  const requestLocation = () => {
    setLocationStatus('loading')
    setRouteStatus('idle')
    setRouteDistances({})
    const locationTimeout = window.setTimeout(() => {
      setLocationStatus((current) => current === 'loading' ? 'blocked' : current)
    }, 30000)
    getMobileFriendlyLocation(
      (location) => {
        window.clearTimeout(locationTimeout)
        setUserLocation(location)
        setLocationStatus('ready')
      },
      () => {
        window.clearTimeout(locationTimeout)
        setLocationStatus('blocked')
      }
    )
  }

  const recommendations = useMemo(() => {
    return establishments
      .map((est) => {
        const publicCategory = getPublicCategory(est.type, est.dot_classification) || 'Resort'
        const distance = userLocation ? routeDistances[est.id] ?? null : null
        const categoryBoost = behavior.categoryClicks[publicCategory] || 0
        const viewedBoost = behavior.viewedIds.includes(est.id) ? 12 : 0
        const searchBoost = behavior.searches.some((term) =>
          `${est.name} ${est.description || ''} ${est.type}`.toLowerCase().includes(term.toLowerCase())
        )
          ? 10
          : 0
        const featuredBoost = est.featured ? 8 : 0
        const roomBoost = est.total_rooms ? Math.min(est.total_rooms / 8, 8) : 0
        const distanceScore = distance === null ? 0 : 100 - distance * 18
        const score = distanceScore + categoryBoost * 7 + viewedBoost + searchBoost + featuredBoost + roomBoost
        const reason = userLocation && distance !== null
          ? `${distance.toFixed(1)} km from your location, with a match to your browsing pattern.`
          : 'Recommended from your browsing pattern and Balayan travel interests.'
        return { ...est, publicCategory, distance, score, reason }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }, [establishments, behavior, userLocation, routeDistances])

  const nearestStays = useMemo(() => {
    if (!userLocation) {
      return establishments
        .filter((est) => Boolean(getStoredLocation(est)))
        .slice(0, 4)
        .map((est) => ({ ...est, distance: null as number | null }))
    }

    return establishments
      .map((est) => {
        const distance = routeDistances[est.id]
        return typeof distance === 'number' && Number.isFinite(distance) ? { ...est, distance } : null
      })
      .filter((est): est is Establishment & { distance: number } => Boolean(est))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4)
  }, [establishments, userLocation, routeDistances])

  const selectedRating = selectedEstablishment ? ratingSummaries[selectedEstablishment.id] || emptyRatingSummary : emptyRatingSummary
  const selectedReviews = selectedEstablishment ? ratingReviews[selectedEstablishment.id] || [] : []
  const selectedPhotos = selectedEstablishment?.images?.filter((image) => typeof image === 'string' && image.trim().length > 0) || []
  const selectedPhoto = selectedPhotos[selectedPhotoIndex] || selectedPhotos[0]

  const openDirectionsToEstablishment = (establishment: Establishment) => {
    if (userLocation) {
      window.open(getGoogleMapsDirectionsUrl(establishment, userLocation), '_blank')
      return
    }

    // Open the exact saved pin immediately. If location permission succeeds,
    // replace the route with the visitor's actual starting point afterward.
    const directionsWindow = window.open(getGoogleMapsDirectionsUrl(establishment, null), '_blank')

    const navigateToDirections = (origin?: UserLocation | null) => {
      const directionsUrl = getGoogleMapsDirectionsUrl(establishment, origin)

      if (directionsWindow) {
        directionsWindow.location.href = directionsUrl
      } else {
        window.location.href = directionsUrl
      }
    }

    getMobileFriendlyLocation(
      (location) => {
        setUserLocation(location)
        setLocationStatus('ready')
        navigateToDirections(location)
      },
      () => {
        setLocationStatus('blocked')
        navigateToDirections(null)
      }
    )
  }

  return (
    <main className="min-h-[100dvh] bg-[#E0E5EC] text-[#193364]">
      <section className="relative overflow-hidden border-b border-[#AFB3B5] bg-[#E0E5EC] text-[#193364]">
        <img
          src="/balayan-church-hero.jpg"
          alt="Historic church and plaza in Balayan"
          className="absolute inset-0 h-full w-full object-cover opacity-42"
        />
        <div className="absolute inset-0 bg-[#E0E5EC]/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#193364]/85 via-[#193364]/55 to-transparent" />
        <div className="relative mx-auto grid min-h-0 max-w-7xl grid-cols-1 items-center gap-8 px-5 py-10 sm:px-6 lg:min-h-[76dvh] lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
          <div className="max-w-2xl">
            <Badge className="mb-5 rounded-full border-[#AFB3B5] bg-[#E5E8E1] px-4 py-2 text-sm font-medium text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.35),inset_-3px_-3px_7px_rgba(255,255,255,0.65)] hover:bg-[#E5E8E1]">
              <Sparkles className="h-4 w-4" strokeWidth={1.8} />
              VistaBalayan travel guide
            </Badge>
            <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)] sm:text-5xl lg:text-6xl">
              Find stays that fit your Balayan trip.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] sm:text-lg">
              Browse verified resorts and hotels, compare ratings, and view every uploaded listing photo.
            </p>
            <Card className="public-neumorphic-soft-surface mt-8 flex-col gap-0 overflow-hidden rounded-[1.5rem] border-[#AFB3B5] p-3 text-[#193364]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-[#6C7895]" />
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search resort, hotel, address, pool, beach, or amenity"
                  className="h-14 rounded-[1.25rem] border border-[#AFB3B5] bg-[#E0E5EC] pl-12 pr-4 text-base text-[#193364] shadow-[inset_3px_3px_6px_rgba(163,177,198,0.30),inset_-3px_-3px_6px_rgba(255,255,255,0.55)] placeholder:text-[#6C7895] focus-visible:border-[#193364]/45 focus-visible:ring-2 focus-visible:ring-[#193364]/20"
                />
              </div>
              <div className="mt-1 grid grid-cols-2 gap-2 lg:hidden">
                <Button
                  type="button"
                  onClick={() => setMobileDiscoveryPanel('nearest')}
                  aria-label="Show destinations near me"
                  className="h-11 justify-center rounded-2xl bg-[#193364] px-3 text-sm font-semibold text-white shadow-[5px_5px_10px_rgba(163,177,198,0.60),-5px_-5px_10px_rgba(255,255,255,0.52)] hover:bg-[#193364] active:translate-y-[1px]"
                >
                  <Navigation className="h-4 w-4" strokeWidth={1.8} />
                  Near me
                </Button>
                <Button
                  type="button"
                  onClick={() => setMobileDiscoveryPanel('recommendations')}
                  aria-expanded={mobileDiscoveryPanel === 'recommendations'}
                  aria-label="Show personalized picks"
                  className="h-11 justify-center rounded-2xl bg-[#E5E8E1] px-3 text-sm font-semibold text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.35),inset_-3px_-3px_7px_rgba(255,255,255,0.65)] hover:bg-[#F5F8FF] active:translate-y-[1px]"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                  For you
                </Button>
              </div>
            </Card>
          </div>

          <Card className="public-neumorphic-soft-surface hidden rounded-[2rem] text-[#193364] lg:block">
            <CardContent className="p-3 !pb-3">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#323232]">Personalized picks</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em]">Where to stay next</h2>
                </div>
                <Button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationStatus === 'loading'}
                  className="rounded-2xl bg-[#193364] px-4 py-2 text-sm font-semibold text-white shadow-[5px_5px_10px_rgba(163,177,198,0.60),-5px_-5px_10px_rgba(255,255,255,0.52)] hover:bg-[#193364] active:translate-y-[1px] disabled:cursor-wait disabled:opacity-80"
                >
                  {locationStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />}
                  {locationStatus === 'loading' ? 'Locating...' : locationStatus === 'ready' ? 'Location on' : 'Use location'}
                </Button>
              </div>
              <div className="space-y-3">
                {recommendations.map((est) => (
                  <button
                    key={est.id}
                    onClick={() => openDetails(est)}
                    className="w-full rounded-2xl border border-[#AFB3B5] bg-[#E5E8E1] p-4 text-left transition hover:bg-[#F5F8FF] active:translate-y-[1px]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="public-neumorphic-inset mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl text-[#193364]">
                        {React.createElement(getCategoryIcon(est.type), { className: 'h-5 w-5', strokeWidth: 1.8 })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#193364]">{est.name}</p>
                        <p className="mt-1 text-sm leading-5 text-[#323232]">{est.reason}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6 lg:px-8">
        <Card className="rounded-[1.75rem] border-[#AFB3B5] bg-[#E0E5EC] shadow-[9px_9px_16px_rgba(163,177,198,0.60),-9px_-9px_16px_rgba(255,255,255,0.55)]">
          <CardContent className="flex flex-col gap-5 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const Icon = cat.icon
                return (
                  <Button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryChange(cat.id)}
                    variant={selectedType === cat.id ? 'default' : 'secondary'}
                    className={`rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-none active:translate-y-[1px] ${
                      selectedType === cat.id
                        ? 'bg-[#193364] text-white hover:bg-[#193364]'
                        : 'bg-[#E5E8E1] text-[#193364] hover:bg-[#AFB3B5]'
                    }`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                    {cat.name}
                  </Button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Filter className="h-4 w-4" strokeWidth={1.8} />
              Showing {filtered.length} resorts and hotels
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-5 pb-16 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <div>
          {loading ? (
            <Card className="rounded-[2rem] border-[#AFB3B5] bg-[#E0E5EC] py-14 shadow-[0_24px_80px_rgba(14,90,114,0.08)]">
              <CardContent className="flex flex-col items-center justify-center gap-4 p-6">
                <div className="h-12 w-44 animate-pulse rounded-full bg-[#E5E8E1]" />
                <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
                  {[1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-[#f0f7f5]" />)}
                </div>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="rounded-[2rem] border-[#AFB3B5] bg-[#E0E5EC] p-12 text-center shadow-[0_24px_80px_rgba(14,90,114,0.08)]">
              <p className="text-slate-500">No resorts or hotels found. Try a different search.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((est) => {
                const Icon = getCategoryIcon(est.type, est.dot_classification)
                const displayImage = est.images && est.images.length > 0 ? est.images[0] : null
                const publicCategory = getPublicCategory(est.type, est.dot_classification)
                return (
                  <Card
                    key={est.id}
                    className="public-neumorphic-surface group overflow-hidden rounded-[1.7rem] border-[#AFB3B5] py-0 transition duration-200 hover:-translate-y-1 hover:shadow-[12px_12px_20px_rgba(163,177,198,0.68),-12px_-12px_20px_rgba(255,255,255,0.62)]"
                  >
                    <button onClick={() => openDetails(est)} className="w-full text-left active:translate-y-[1px]">
                      {displayImage ? (
                        <div className="relative h-36 overflow-hidden sm:h-56">
                          <ListingPhoto sources={est.images} alt={est.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          {est.images.length > 1 && (
                            <Badge className="absolute bottom-3 right-3 rounded-full border-white/10 bg-[#193364]/75 px-3 py-1 text-xs font-semibold text-white shadow-lg hover:bg-[#193364]/75">
                              {est.images.length} photos
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="public-neumorphic-inset flex h-36 items-center justify-center sm:h-56">
                          <Icon className="h-14 w-14 text-[#6C9772]" strokeWidth={1.8} />
                        </div>
                      )}
                      <CardContent className="p-3 sm:p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-[-0.02em] text-slate-950 sm:text-lg sm:leading-6">{est.name}</h3>
                          <Badge className="shrink-0 rounded-full bg-[#E5E8E1] px-3 py-1 text-xs font-semibold text-[#193364] shadow-none hover:bg-[#E5E8E1]">
                            {publicCategory}
                          </Badge>
                        </div>
                        <RatingDisplay summary={ratingSummaries[est.id]} className="mb-3" />
                        <div className="flex items-start gap-1.5 text-xs leading-4 text-slate-600 sm:gap-2 sm:text-sm sm:leading-5">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
                          <span className="min-w-0 truncate whitespace-nowrap" title={est.address}>{est.address}</span>
                        </div>
                        {est.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600 sm:mt-3 sm:text-sm sm:leading-6">{est.description}</p>}
                                                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#193364] sm:mt-4 sm:text-sm">
                          View details <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" strokeWidth={1.8} />
                        </span>
                      </CardContent>
                    </button>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        <Card className="hidden h-fit rounded-[2rem] border-[#AFB3B5] bg-[#E0E5EC] shadow-[9px_9px_16px_rgba(163,177,198,0.60),-9px_-9px_16px_rgba(255,255,255,0.55)] lg:sticky lg:top-6 lg:block">
          <CardContent className="p-3 sm:p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Nearest picks</p>
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-slate-950">{userLocation ? 'Close to you' : 'Nearby stays'}</h2>
                <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">
                  {locationStatus === 'loading'
                    ? 'Waiting for your phone GPS permission. This will stop if it takes too long.'
                    : userLocation && routeStatus === 'loading'
                      ? 'GPS found. Calculating routed road distances...'
                      : userLocation && routeStatus === 'error'
                        ? 'GPS found, but road distances are temporarily unavailable.'
                        : userLocation
                          ? 'Distances use routed road estimates when available.'
                          : 'Tap Improve with my location for distance-based results.'}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E5E8E1] text-[#193364]">
                <Navigation className="h-5 w-5" strokeWidth={1.8} />
              </div>
            </div>
            <div className="space-y-3">
              {userLocation && routeStatus === 'loading' && (
                <div className="flex items-center gap-3 rounded-2xl border border-[#AFB3B5]/70 bg-[#F5F8FF] p-4 text-sm font-medium text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-[#193364]" strokeWidth={1.8} />
                  Calculating road distances...
                </div>
              )}
              {userLocation && routeStatus === 'error' && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                  Your GPS location was found, but the route-distance service did not respond. Tap retry, or open directions from any listing.
                </div>
              )}
              {userLocation && routeStatus === 'ready' && nearestStays.length === 0 && (
                <div className="rounded-2xl border border-[#AFB3B5]/70 bg-[#F5F8FF] p-4 text-xs leading-5 text-slate-600">
                  GPS is on, but road distances are not available for these pins right now. You can still open directions from any listing.
                </div>
              )}
              {nearestStays.map((est) => (
                <button key={est.id} onClick={() => openDetails(est)} className="w-full rounded-2xl border border-[#AFB3B5]/70 bg-[#F5F8FF] p-4 text-left transition hover:bg-[#E5E8E1] active:translate-y-[1px]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold leading-5 text-slate-950">{est.name}</p>
                      <p className="mt-1 text-sm text-slate-500">{getPublicCategory(est.type, est.dot_classification)}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-[#AFB3B5] bg-[#F5F8FF] px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-[inset_3px_3px_7px_rgba(163,177,198,0.35),inset_-3px_-3px_7px_rgba(255,255,255,0.65)]">
                      {est.distance === null ? 'Use GPS' : `${est.distance.toFixed(1)} km route`}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
            {(locationStatus !== 'ready' || routeStatus === 'error' || (userLocation && routeStatus === 'ready' && nearestStays.length === 0)) && (
              <>
                <Button
                  onClick={requestLocation}
                  disabled={locationStatus === 'loading'}
                  variant="outline"
                  className="mt-5 w-full rounded-2xl border-slate-200 py-3 text-sm font-semibold text-slate-700 shadow-none hover:bg-[#F5F8FF] disabled:cursor-wait disabled:opacity-80"
                >
                  {locationStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />}
                  {locationStatus === 'loading' ? 'Getting phone location...' : routeStatus === 'error' ? 'Retry GPS distance' : 'Improve with my location'}
                </Button>
                {locationStatus === 'blocked' && (
                  <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    Phone location did not respond or is blocked. Turn on Location Services, allow Location for Safari/Chrome and this website, then tap again. Directions still work using the establishment pin.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {mobileDiscoveryPanel && (
        <div
          className="fixed inset-0 z-40 flex items-end bg-[#193364]/35 p-3 backdrop-blur-sm lg:hidden"
          role="presentation"
          onClick={() => setMobileDiscoveryPanel(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-discovery-title"
            className="max-h-[85dvh] w-full overflow-y-auto rounded-[1.75rem] bg-[#E0E5EC] p-4 text-[#193364] shadow-[0_-12px_30px_rgba(25,51,100,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">VistaBalayan discovery</p>
                <h2 id="mobile-discovery-title" className="mt-1 text-2xl font-semibold tracking-[-0.025em]">
                  {mobileDiscoveryPanel === 'nearest' ? (userLocation ? 'Close to you' : 'Nearby stays') : 'Where to stay next'}
                </h2>
              </div>
              <Button
                type="button"
                variant="outline"
                aria-label="Close discovery panel"
                onClick={() => setMobileDiscoveryPanel(null)}
                className="h-10 w-10 shrink-0 rounded-full border-[#AFB3B5] bg-[#E5E8E1] p-0 text-[#193364] shadow-none hover:bg-[#F5F8FF]"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </Button>
            </div>

            {mobileDiscoveryPanel === 'recommendations' ? (
              <div className="space-y-3">
                <p className="text-sm leading-5 text-slate-600">Personalized suggestions based on your browsing pattern and travel interests.</p>
                {recommendations.map((est) => (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => { setMobileDiscoveryPanel(null); openDetails(est) }}
                    className="w-full rounded-2xl border border-[#AFB3B5] bg-[#E5E8E1] p-4 text-left transition hover:bg-[#F5F8FF] active:translate-y-[1px]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="public-neumorphic-inset mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#193364]">
                        {React.createElement(getCategoryIcon(est.type), { className: 'h-5 w-5', strokeWidth: 1.8 })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[#193364]">{est.name}</p>
                        <p className="mt-1 text-sm leading-5 text-[#323232]">{est.reason}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-5 text-slate-600">
                  {userLocation ? 'Showing the closest destinations using routed road estimates when available.' : 'Allow location access to sort destinations by distance from you.'}
                </p>
                {nearestStays.map((est) => (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => { setMobileDiscoveryPanel(null); openDetails(est) }}
                    className="w-full rounded-2xl border border-[#AFB3B5]/70 bg-[#F5F8FF] p-4 text-left transition hover:bg-[#E5E8E1] active:translate-y-[1px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-5 text-slate-950">{est.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{getPublicCategory(est.type, est.dot_classification)}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-full border-[#AFB3B5] bg-[#F5F8FF] px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-none">
                        {est.distance === null ? 'Use GPS' : `${est.distance.toFixed(1)} km route`}
                      </Badge>
                    </div>
                  </button>
                ))}
                {(locationStatus !== 'ready' || routeStatus === 'error') && (
                  <Button
                    type="button"
                    onClick={requestLocation}
                    disabled={locationStatus === 'loading'}
                    className="mt-2 w-full rounded-2xl bg-[#193364] py-3 text-sm font-semibold text-white shadow-[5px_5px_10px_rgba(163,177,198,0.60),-5px_-5px_10px_rgba(255,255,255,0.52)] hover:bg-[#193364] disabled:cursor-wait disabled:opacity-80"
                  >
                    {locationStatus === 'loading' && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />}
                    {locationStatus === 'loading' ? 'Getting phone location...' : routeStatus === 'error' ? 'Retry GPS distance' : 'Use my location'}
                  </Button>
                )}
                {locationStatus === 'blocked' && (
                  <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    Location access is blocked. Allow location for this website, then try again.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {selectedEstablishment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#193364]/35 p-4 backdrop-blur-sm" onClick={() => setSelectedEstablishment(null)}>
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedEstablishment(null)}
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-[#E0E5EC] text-slate-700 shadow-[5px_5px_10px_rgba(163,177,198,0.60),-5px_-5px_10px_rgba(255,255,255,0.52)] ring-1 ring-[#AFB3B5] transition hover:bg-[#F5F8FF] hover:text-slate-950"
              aria-label="Close establishment details"
            >
              <X className="h-5 w-5" strokeWidth={1.9} />
            </button>
            <div className="max-h-[90dvh] overflow-y-auto rounded-[2rem] bg-[#E0E5EC] shadow-[12px_12px_28px_rgba(163,177,198,0.62),-8px_-8px_20px_rgba(255,255,255,0.58)]">
              {selectedPhotos.length > 0 ? (
              <div className="bg-[#193364]">
                <div className="relative">
                  <img src={selectedPhoto} alt={`${selectedEstablishment.name} photo ${selectedPhotoIndex + 1}`} className="h-72 w-full object-cover sm:h-96" />
                  {selectedPhotos.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoIndex((current) => (current === 0 ? selectedPhotos.length - 1 : current - 1))}
                        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#E0E5EC] text-xl font-semibold text-slate-900 shadow-lg transition hover:bg-[#F5F8FF]"
                        aria-label="Previous photo"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPhotoIndex((current) => (current + 1) % selectedPhotos.length)}
                        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#E0E5EC] text-xl font-semibold text-slate-900 shadow-lg transition hover:bg-[#F5F8FF]"
                        aria-label="Next photo"
                      >
                        ›
                      </button>
                      <span className="absolute bottom-3 right-3 rounded-full bg-[#193364]/75 px-3 py-1 text-xs font-semibold text-white shadow-lg">
                        {selectedPhotoIndex + 1} / {selectedPhotos.length}
                      </span>
                    </>
                  )}
                </div>
                {selectedPhotos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto p-3">
                    {selectedPhotos.map((photo, index) => (
                      <button
                        key={`${photo}-${index}`}
                        type="button"
                        onClick={() => setSelectedPhotoIndex(index)}
                        className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${index === selectedPhotoIndex ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'}`}
                        aria-label={`View photo ${index + 1}`}
                      >
                        <img src={photo} alt={`${selectedEstablishment.name} thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="public-neumorphic-inset flex h-56 items-center justify-center">
                {React.createElement(getCategoryIcon(selectedEstablishment.type), { className: 'h-14 w-14 text-[#6C9772]', strokeWidth: 1.8 })}
              </div>
            )}
            <div className="p-6 sm:p-8">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Badge className="mb-3 rounded-full bg-[#E5E8E1] px-3 py-1 text-xs font-semibold text-[#193364] shadow-none hover:bg-[#E5E8E1]">
                    {getPublicCategory(selectedEstablishment.type)}
                  </Badge>
                  <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{selectedEstablishment.name}</h2>
                </div>
                <div className="rounded-full bg-[#F5F8FF] px-3 py-2">
                  <RatingDisplay summary={selectedRating} />
                </div>
              </div>

              {selectedEstablishment.description && (
                <div className="mb-5 rounded-2xl bg-[#F5F8FF] p-5">
                  <h3 className="font-semibold text-slate-950">Establishment overview</h3>
                  <p className="mt-2 leading-7 text-slate-600">{selectedEstablishment.description}</p>
                </div>
              )}

              <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <InfoRow icon={MapPin} text={selectedEstablishment.address} />
                {selectedEstablishment.contact_number && <InfoRow icon={Phone} text={selectedEstablishment.contact_number} />}
                {selectedEstablishment.email && <InfoRow icon={Mail} text={selectedEstablishment.email} />}
                {selectedEstablishment.opening_hours && <InfoRow icon={Clock} text={selectedEstablishment.opening_hours} />}
                {selectedEstablishment.website_url && (
                  <a href={selectedEstablishment.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl bg-[#F5F8FF] p-3 font-medium text-[#193364] hover:bg-[#E5E8E1]">
                    <Globe className="h-4 w-4" strokeWidth={1.8} />
                    Visit website
                  </a>
                )}
              </div>

              <div className="public-neumorphic-surface mt-5 overflow-hidden rounded-2xl p-1">
                <div className="flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">Location & Directions</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {hasExactLocation(selectedEstablishment)
                        ? 'View the exact saved pin or get driving directions.'
                        : 'Exact map pin is not available yet for this listing.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => openDirectionsToEstablishment(selectedEstablishment)}
                      className="rounded-2xl bg-[#193364] px-4 py-2.5 text-sm font-semibold text-white shadow-none hover:bg-[#193364]"
                    >
                      <Navigation className="h-4 w-4" strokeWidth={1.8} />
                      Get Directions
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowSelectedMap((current) => !current)}
                      variant="outline"
                      disabled={!hasExactLocation(selectedEstablishment)}
                      className="rounded-2xl border-[#AFB3B5] bg-[#F5F8FF] px-4 py-2.5 text-sm font-semibold text-[#193364] shadow-none hover:bg-[#E5E8E1] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MapPin className="h-4 w-4" strokeWidth={1.8} />
                      {hasExactLocation(selectedEstablishment) ? (showSelectedMap ? 'Hide map' : 'View map') : 'No exact pin'}
                    </Button>
                  </div>
                </div>
                {showSelectedMap && (
                  <iframe
                    title={`${selectedEstablishment.name} OpenStreetMap location`}
                    src={getOpenStreetMapEmbedUrl(selectedEstablishment)}
                    className="h-64 w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                )}
              </div>

              <Separator className="my-6 bg-[#AFB3B5]" />

              <div className="public-neumorphic-inset rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-6 text-slate-950">Rate this establishment</h3>
                  </div>
                  <div className="grid shrink-0 grid-cols-5 gap-0.5" aria-label="Choose a rating from 1 to 5 stars">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => setSelectedReviewRating(rating)}
                        disabled={submittingRating}
                        className="rounded-full p-1 text-[#193364] transition hover:scale-110 hover:bg-[#F5F8FF] disabled:cursor-not-allowed disabled:opacity-60 sm:p-1.5"
                        aria-label={`Rate ${rating} star${rating === 1 ? '' : 's'}`}
                      >
                        <Star
                          className={`h-5 w-5 sm:h-7 sm:w-7 ${rating <= (selectedReviewRating || selectedRating.visitorRating || 0) ? 'fill-[#193364]' : 'fill-white'}`}
                          strokeWidth={1.8}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value.slice(0, 80))}
                    placeholder="Your name"
                    aria-label="Your name"
                    required
                    className="w-full rounded-2xl border border-[#AFB3B5] bg-[#F5F8FF] p-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-[#6C9772]/25"
                  />
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value.slice(0, 500))}
                    placeholder="Optional: tell others why you chose this rating"
                    className="min-h-24 w-full rounded-2xl border border-[#AFB3B5] bg-[#F5F8FF] p-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-[#6C9772]/25"
                  />
                  <div className="rounded-2xl border border-dashed border-[#AFB3B5] bg-[#E5E8E1] p-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#193364]">
                      <ImagePlus className="h-4 w-4" />
                      Add a photo (optional)
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={submittingRating}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          if (!file) return
                          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                            setRatingMessage('Please choose a JPG, PNG, or WebP image.')
                            return
                          }
                          if (file.size > 5 * 1024 * 1024) {
                            setRatingMessage('Review photos must be 5 MB or smaller.')
                            return
                          }
                          setReviewPhoto(file)
                          setReviewPhotoPreview(URL.createObjectURL(file))
                          setRatingMessage('')
                        }}
                      />
                    </label>
                    {reviewPhoto && (
                      <div className="mt-3 flex items-center gap-3">
                        {reviewPhotoPreview && <img src={reviewPhotoPreview} alt="Selected review preview" className="h-16 w-16 rounded-xl object-cover" />}
                        <div className="min-w-0 flex-1 text-xs text-slate-600">
                          <p className="truncate">{reviewPhoto.name}</p>
                          <button type="button" onClick={() => { setReviewPhoto(null); setReviewPhotoPreview('') }} className="mt-1 font-semibold text-rose-700 hover:underline">Remove photo</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">Name required · {reviewComment.length}/500 comment characters</p>
                    <Button
                      type="button"
                      onClick={submitRating}
                      disabled={submittingRating || selectedReviewRating < 1 || !reviewerName.trim()}
                      className="rounded-2xl bg-[#193364] px-5 py-2.5 text-sm font-semibold text-white shadow-none transition hover:bg-[#193364] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {submittingRating ? 'Saving...' : 'Submit rating'}
                    </Button>
                  </div>
                </div>
                {ratingMessage && <p className="mt-3 text-sm font-medium text-[#193364]">{ratingMessage}</p>}
              </div>

              <ReviewSummary summary={selectedRating} reviews={selectedReviews} />


              <Button
                onClick={() => setSelectedEstablishment(null)}
                className="mt-6 w-full rounded-2xl bg-[#193364] py-3.5 font-semibold text-white shadow-none transition hover:bg-[#193364] active:translate-y-[1px]"
              >
                Close
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ReviewSummary({ summary, reviews }: { summary: RatingSummary; reviews: RatingReview[] }) {
  const [selectedRating, setSelectedRating] = useState(0)
  const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)
  const sortedReviews = sortReviewsForDisplay(reviews)
  const filteredReviews = selectedRating > 0
    ? sortedReviews.filter((review) => review.rating === selectedRating)
    : sortedReviews

  return (
    <div className="public-neumorphic-surface mt-6 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold leading-6 text-slate-950 sm:text-base">Reviews & ratings</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">{summary.count} total review{summary.count === 1 ? '' : 's'} · {summary.commentCount} with comment{summary.commentCount === 1 ? '' : 's'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedRating > 0 && (
            <button
              type="button"
              onClick={() => setSelectedRating(0)}
              className="whitespace-nowrap rounded-full bg-[#E5E8E1] px-3 py-1.5 text-xs font-semibold text-[#193364] transition hover:bg-[#AFB3B5]"
            >
              Clear filter
            </button>
          )}
          <MessageSquare className="h-5 w-5 shrink-0 text-[#193364]" strokeWidth={1.8} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Filter reviews by star rating">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = summary.breakdown[star as keyof RatingBreakdown] || 0
          const hasReviews = count > 0
          return (
            <button
              key={star}
              type="button"
              onClick={() => setSelectedRating((current) => current === star ? 0 : star)}
              className={`min-w-0 rounded-2xl border px-1.5 py-2 text-center text-xs font-semibold transition active:translate-y-[1px] ${
                selectedRating === star
                  ? 'border-[#193364] bg-[#E5E8E1] text-[#193364] shadow-sm'
                  : 'border-slate-100 bg-[#F5F8FF] text-slate-600 hover:border-[#AFB3B5] hover:bg-[#E5E8E1]'
              }`}
              aria-pressed={selectedRating === star}
              aria-label={`Show ${star} star review${star === 1 ? '' : 's'}`}
            >
              <span className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                {star}
                <Star className={`h-3.5 w-3.5 ${hasReviews ? 'fill-[#193364] text-[#193364]' : 'fill-slate-100 text-slate-300'}`} strokeWidth={1.8} />
              </span>
              <span className={`mt-1 block text-[11px] leading-none ${hasReviews ? 'text-slate-800' : 'text-slate-400'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {selectedRating > 0 ? `Showing ${selectedRating}-star reviews only.` : 'Tap a star filter to filter reviews.'}
      </p>

      <div className="mt-5 space-y-3">
        {filteredReviews.length === 0 ? (
          <p className="rounded-2xl bg-[#F5F8FF] p-4 text-sm text-slate-500">{selectedRating > 0 ? `No ${selectedRating}-star reviews yet.` : 'No public review comments yet.'}</p>
        ) : (
          filteredReviews.map((review, index) => {
            const display = getReviewDisplay(review)
            return (
              <div key={`${review.establishment_id}-${review.created_at}-${index}`} className="rounded-2xl bg-[#F5F8FF] p-4">
                <div className="flex items-center justify-between gap-3">
                  <RatingDisplay summary={{ average: review.rating, count: 1, breakdown: { ...emptyBreakdown, [review.rating]: 1 }, commentCount: display.comment ? 1 : 0 }} />
                  <span className="text-xs text-slate-400">{new Date(review.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">{display.reviewerName}</p>
                {review.photo_path && (
                  <button
                    type="button"
                    onClick={() => setExpandedPhoto(supabase.storage.from('review-photos').getPublicUrl(review.photo_path as string).data.publicUrl)}
                    className="group mt-3 block overflow-hidden rounded-xl text-left focus:outline-none focus:ring-4 focus:ring-[#6C9772]/30"
                    aria-label="Expand photo shared with this review"
                  >
                    <img
                      src={supabase.storage.from('review-photos').getPublicUrl(review.photo_path).data.publicUrl}
                      alt="Photo shared with this review. Click to expand."
                      className="h-20 w-28 rounded-xl object-cover transition duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                    <span className="mt-1 block text-[11px] font-medium text-[#193364]">Click to expand</span>
                  </button>
                )}
                {display.comment && <p className="mt-2 text-sm leading-6 text-slate-600">{display.comment}</p>}
              </div>
            )
          })
        )}
      </div>

      {expandedPhoto && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#193364]/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded review photo"
          onClick={() => setExpandedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedPhoto(null)}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#E0E5EC] text-slate-900 shadow-lg hover:bg-[#F5F8FF] focus:outline-none focus:ring-4 focus:ring-white/50"
            aria-label="Close expanded photo"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
          <img
            src={expandedPhoto}
            alt="Expanded photo shared with this review"
            className="max-h-[88vh] max-w-[94vw] rounded-2xl object-contain shadow-[12px_12px_28px_rgba(15,25,45,0.34),-8px_-8px_20px_rgba(255,255,255,0.14)]"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function RatingDisplay({ summary, className = '' }: { summary?: RatingSummary; className?: string }) {
  const rating = summary || emptyRatingSummary
  const rounded = Math.round(rating.average)

  return (
    <div className={`flex items-center gap-2 text-sm font-semibold text-slate-600 ${className}`}>
      <div className="flex items-center gap-0.5 text-[#193364]">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={`h-4 w-4 ${star <= rounded ? 'fill-[#193364]' : 'fill-slate-100'}`} strokeWidth={1.8} />
        ))}
      </div>
      <span>{rating.count > 0 ? `${rating.average.toFixed(1)} (${rating.count})` : '(0)'}</span>
    </div>
  )
}

function InfoRow({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[#F5F8FF] p-3">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={1.8} />
      <span>{text}</span>
    </div>
  )
}

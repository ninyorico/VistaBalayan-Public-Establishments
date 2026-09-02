import { useEffect, useState } from 'react'
import { AlertTriangle, Info, CheckCircle, Brain, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { geminiService } from '../../../services/geminiService'
import { cleanAiText, formatConfidence, splitAiRecommendation } from '../../../lib/aiText'
import { calculateAverageAccommodationOccupancy } from '../../../lib/reportMetrics'
import { AiFormattedText } from '../../components/AiFormattedText'

interface Anomaly {
  id: string
  anomaly_type: string
  severity: string
  description: string
  recommendation: string
  detected_at: string
}

interface Insight {
  id: string
  title: string
  description: string
  impact: string
  category: string
  recommended_action?: string
  confidence_score?: number
}

export default function StaffAIInsights() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [establishmentName, setEstablishmentName] = useState<string>('')
  const [establishmentId, setEstablishmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUserAndData()
  }, [])

  const loadUserAndData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError('User not found. Please log in again.')
        setLoading(false)
        return
      }
      
      console.log('Current user:', user.id)
      
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (profileError) {
        console.error('Profile error:', profileError)
        setError('Could not load your profile. Please contact support.')
        setLoading(false)
        return
      }
      
      console.log('Profile data:', profileData)
      
      if (!profileData?.establishment_id) {
        setError('No establishment associated with your account. Please contact the municipal tourism officer.')
        setLoading(false)
        return
      }
      
      setEstablishmentId(profileData.establishment_id)
      
      // Fetch establishment name separately
      const { data: estData, error: estError } = await supabase
        .from('establishments')
        .select('name')
        .eq('id', profileData.establishment_id)
        .single()
      
      if (estError) {
        console.error('Establishment error:', estError)
      }
      
      if (estData) {
        setEstablishmentName(estData.name)
        console.log('Establishment name:', estData.name)
      }
      
      // Load cached data for this establishment
      await loadCachedData(profileData.establishment_id)
      
    } catch (error) {
      console.error('Error loading user data:', error)
      setError('Failed to load your data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

const loadCachedData = async (estId: string) => {
  if (!estId) return
  
  console.log('Loading cached data for establishment:', estId)
  
  try {
    // Load anomalies specific to this establishment
    const { data: anomaliesData, error: anomaliesError } = await supabase
      .from('ai_anomalies_cache')
      .select('*')
      .eq('establishment_id', estId)
      .eq('status', 'active')
      .eq('is_resolved', false)
      .order('detected_at', { ascending: false })

    if (anomaliesError) {
      console.error('Anomalies error:', anomaliesError)
    } else {
      console.log('Anomalies found:', anomaliesData?.length || 0)
      setAnomalies(anomaliesData || [])
    }

    // Load recommendations specific to this establishment ONLY
    const { data: insightsData, error: insightsError } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('status', 'active')
      .eq('establishment_id', estId)  // ← ADD THIS FILTER
      .order('created_at', { ascending: false })
      .limit(10)

    if (insightsError) {
      console.error('Insights error:', insightsError)
    } else {
      console.log('Insights found:', insightsData?.length || 0)
      setInsights(insightsData || [])
    }

  } catch (error) {
    console.error('Error loading cached data:', error)
  }
}

  const refreshData = async () => {
    if (!establishmentId) {
      setError('No establishment associated with your account')
      return
    }
    
    setRefreshing(true)
    setError(null)
    
    try {
      // Fetch this establishment's visitor data only
      const { data: visitorData, error: visitorError } = await supabase
        .from('visitor_reports')
        .select('report_date, total_guests, residence_type')
        .eq('establishment_id', establishmentId)
        .eq('status', 'approved')
        .order('report_date', { ascending: false })
        .limit(200)

      if (visitorError) {
        console.error('Visitor data error:', visitorError)
      }

      // Fetch this establishment's accommodation data
      const { data: accommodationData, error: accError } = await supabase
        .from('accommodation_reports')
        .select('id, report_date, total_rooms, total_occupied_rooms')
        .eq('establishment_id', establishmentId)
        .eq('status', 'approved')

      if (accError) {
        console.error('Accommodation data error:', accError)
      }

      // Calculate analytics for this establishment
      const totalVisitors = visitorData?.reduce((sum, v) => sum + (v.total_guests || 0), 0) || 0
      
      const avgOccupancy = calculateAverageAccommodationOccupancy(accommodationData || [])

      // Monthly trends for this establishment
      const monthlyTrends: Record<string, number> = {}
      visitorData?.forEach(v => {
        if (v.report_date) {
          const month = v.report_date.slice(0, 7)
          monthlyTrends[month] = (monthlyTrends[month] || 0) + (v.total_guests || 0)
        }
      })

      // Generate insights and anomalies for this establishment
      const [newInsights, newAnomalies] = await Promise.all([
        geminiService.generateAndSaveInsightsForEstablishment({
          establishmentName,
          establishmentId,
          totalVisitors,
          avgOccupancy,
          monthlyTrends
        }),
        geminiService.generateAndSaveAnomaliesForEstablishment(
          visitorData || [],
          establishmentId,
          establishmentName
        )
      ])

      // Reload cached data
      await loadCachedData(establishmentId)
      
      console.log(`✅ Data refreshed for ${establishmentName}: ${newInsights?.length || 0} insights, ${newAnomalies?.length || 0} anomalies`)
      
    } catch (error) {
      console.error('Error refreshing data:', error)
      setError('Failed to refresh data. Please try again.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1CA7C9] mx-auto mb-4" />
          <p className="text-gray-600">Loading AI insights for your establishment...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load AI Insights</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadUserAndData}
            className="px-4 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Insights</h1>
          <p className="text-gray-600 mt-1">
            AI-powered recommendations and service gap tracking for {establishmentName || 'your establishment'}
          </p>
        </div>
        <button
          onClick={refreshData}
          disabled={refreshing}
          className="px-4 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] transition flex items-center gap-2"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {refreshing ? 'Refreshing...' : 'Refresh Analysis'}
        </button>
      </div>

      {/* AI Status Card */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <Brain className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">AI Analysis Active</h2>
            <p className="text-purple-100">
              Monitoring {establishmentName} data for insights, service gaps, and operational challenges
            </p>
          </div>
        </div>
      </div>

      {/* Service Gaps / Operational Challenges */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">Service Gaps or Operational Challenges</h3>
          </div>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            {anomalies.filter((a) => a.severity === "medium" || a.severity === "high").length} Active
          </span>
        </div>
        <div className="space-y-3">
          {anomalies.length > 0 ? (
            anomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`border-l-4 rounded-lg p-3 sm:p-4 ${
                  anomaly.severity === "high"
                    ? "border-red-500 bg-red-50"
                    : anomaly.severity === "medium"
                    ? "border-yellow-500 bg-yellow-50"
                    : "border-blue-500 bg-blue-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <AlertTriangle
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        anomaly.severity === "high"
                          ? "text-red-600"
                          : anomaly.severity === "medium"
                          ? "text-yellow-600"
                          : "text-blue-600"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <h4 className="font-semibold text-gray-900">
                          {anomaly.anomaly_type}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            anomaly.severity === "high"
                              ? "bg-red-200 text-red-800"
                              : anomaly.severity === "medium"
                              ? "bg-yellow-200 text-yellow-800"
                              : "bg-blue-200 text-blue-800"
                          }`}
                        >
                          {anomaly.severity}
                        </span>
                      </div>
                      <p className="text-sm leading-5 text-gray-700 mb-2">
                        <AiFormattedText text={anomaly.description} />
                      </p>
                      {anomaly.recommendation && (
                        <div className="flex items-start gap-2 text-sm leading-5">
                          <Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-500" />
                          <AiFormattedText text={anomaly.recommendation} className="text-gray-600" tone="action" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-gray-500">
                      {new Date(anomaly.detected_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800">
                No service gaps or operational challenges detected. Your data quality is excellent!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI-Powered Recommendations */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            AI-Powered Recommendations
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.length > 0 ? (
            insights.map((insight) => {
              const { summary, action } = splitAiRecommendation(insight.description, insight.recommended_action)
              const confidence = formatConfidence(insight.confidence_score)

              return (
              <div
                key={insight.id}
                className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="font-semibold leading-snug text-gray-900">{cleanAiText(insight.title)}</h4>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      insight.impact === "high"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {insight.impact} impact
                  </span>
                </div>
                <p className="text-sm leading-5 text-gray-600 mb-2"><AiFormattedText text={summary} /></p>
                {action && (
                  <p className="text-sm leading-5 text-gray-900 mb-3">
                    <strong className="font-semibold">Action:</strong> <AiFormattedText text={action} tone="action" />
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 font-medium">
                    {cleanAiText(insight.category)}
                  </span>
                  {confidence && (
                    <span className="text-xs text-gray-400">
                      {confidence}
                    </span>
                  )}
                </div>
              </div>
            )})
          ) : (
            <div className="col-span-2 text-center py-8 text-gray-500">
              No recommendations available. Click "Refresh Analysis" to generate insights for your establishment.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { AlertTriangle, TrendingUp, CheckCircle, Info, Brain, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { geminiService } from '../../../services/geminiService'
import { cleanAiText, formatConfidence, splitAiRecommendation } from '../../../lib/aiText'
import { AiFormattedText } from '../../components/AiFormattedText'

const DEFAULT_AI_ITEMS_VISIBLE = 5

interface Anomaly {
  id: string
  anomaly_type: string
  severity: string
  description: string
  recommendation: string
  establishments?: { name: string }
  detected_at: string
  is_resolved: boolean
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

export default function AIInsights() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [showAllServiceGaps, setShowAllServiceGaps] = useState(false)
  const [showAllRecommendations, setShowAllRecommendations] = useState(false)

  const activeAnomalies = anomalies.filter(a => !a.is_resolved)
  const visibleAnomalies = showAllServiceGaps ? activeAnomalies : activeAnomalies.slice(0, DEFAULT_AI_ITEMS_VISIBLE)
  const visibleInsights = showAllRecommendations ? insights : insights.slice(0, DEFAULT_AI_ITEMS_VISIBLE)

  useEffect(() => {
    loadCachedData()
  }, [])

  const loadCachedData = async () => {
    setLoading(true)
    
    try {
      // Load cached anomalies from database
      const { data: anomaliesData } = await supabase
        .from('ai_anomalies_cache')
        .select(`
          *,
          establishments (name)
        `)
        .eq('status', 'active')
        .eq('is_resolved', false)
        .order('detected_at', { ascending: false })

      setAnomalies(anomaliesData || [])

      // Load cached insights from database
      const { data: insightsData } = await supabase
        .from('ai_recommendations')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      setInsights(insightsData || [])

      // Get last update time
      const { data: cacheData } = await supabase
        .from('ai_insights_cache')
        .select('generated_at')
        .eq('insight_type', 'recommendations')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (cacheData) {
        setLastUpdated(new Date(cacheData.generated_at).toLocaleString())
      }

      // If no data exists, generate fresh data
      if ((!anomaliesData || anomaliesData.length === 0) && (!insightsData || insightsData.length === 0)) {
        await refreshData()
      }

    } catch (error) {
      console.error('Error loading cached data:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshData = async () => {
    setRefreshing(true)
    try {
      const { insights: newInsights, anomalies: newAnomalies } = await geminiService.refreshAllData()
      
      // Reload cached data
      await loadCachedData()
      
      console.log(`✅ Data refreshed: ${newInsights?.length || 0} insights, ${newAnomalies?.length || 0} anomalies`)
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1CA7C9] mx-auto mb-4" />
          <p className="text-gray-600">Loading AI insights...</p>
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
            AI-powered service gap tracking and intelligent recommendations
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">Last updated: {lastUpdated}</p>
          )}
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
              Powered by Google Gemini AI 
            </p>
          </div>
        </div>
      </div>

      {/* Service Gaps / Operational Challenges */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            <h3 className="text-base font-semibold leading-snug text-gray-900 sm:text-lg">Service Gaps or Operational Challenges</h3>
          </div>
          <span className="shrink-0 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium leading-tight text-yellow-700 sm:px-3 sm:text-sm">
            {activeAnomalies.length} Active
          </span>
        </div>
        <div className="space-y-3">
          {activeAnomalies.length > 0 ? (
            visibleAnomalies.map((anomaly) => (
              <div
                key={anomaly.id}
                className={`border-l-4 rounded-lg p-3.5 sm:p-4 ${
                  anomaly.severity === 'high'
                    ? 'border-red-500 bg-red-50'
                    : anomaly.severity === 'medium'
                    ? 'border-yellow-500 bg-yellow-50'
                    : 'border-blue-500 bg-blue-50'
                }`}
              >
                <div className="space-y-2" data-ai-card-layout="full-width-mobile">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${
                      anomaly.severity === 'high' ? 'text-red-600' : 
                      anomaly.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
                    }`} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <h4 className="text-base font-semibold leading-snug text-gray-900">{anomaly.anomaly_type}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          anomaly.severity === 'high' ? 'bg-red-200 text-red-800' :
                          anomaly.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' : 'bg-blue-200 text-blue-800'
                        }`}>
                          {anomaly.severity}
                        </span>
                      </div>
                    </div>
                    </div>
                    <p className="shrink-0 whitespace-nowrap text-xs text-gray-500">
                      {new Date(anomaly.detected_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="pl-6 sm:pl-6">
                    <p className="mb-1 text-sm font-medium leading-5 text-gray-700">
                      {anomaly.establishments?.name || 'Municipality-wide'}
                    </p>
                    <p className="mb-2 text-justify text-sm leading-5 text-gray-600 hyphens-auto indent-5" data-ai-text-spacing="justified-even-indent"><AiFormattedText text={anomaly.description} /></p>
                    {anomaly.recommendation && (
                      <div className="mt-2 rounded-md bg-white/70 px-3 py-2 text-justify text-sm leading-5 text-gray-700 ring-1 ring-black/5 hyphens-auto" data-ai-action-note="justified-even">
                        <span className="font-semibold text-gray-800">Recommendation:</span> <AiFormattedText text={anomaly.recommendation} tone="action" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800">No service gaps or operational challenges detected. Data quality is excellent!</p>
            </div>
          )}
        </div>
        {activeAnomalies.length > DEFAULT_AI_ITEMS_VISIBLE && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllServiceGaps((current) => !current)}
              className="px-4 py-2 text-sm font-medium text-[#0F4C75] border border-[#1CA7C9]/30 rounded-lg hover:bg-[#E8F8FC] transition"
            >
              {showAllServiceGaps ? 'Show fewer service gaps' : `See all service gaps (${activeAnomalies.length})`}
            </button>
          </div>
        )}
      </div>

      {/* AI Recommendations */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
          <TrendingUp className="w-5 h-5 text-purple-600" />
          AI-Powered Recommendations
        </h3>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.length > 0 ? (
            visibleInsights.map((insight) => {
              const { summary, action } = splitAiRecommendation(insight.description, insight.recommended_action)
              const confidence = formatConfidence(insight.confidence_score)

              return (
              <div key={insight.id} className="border border-gray-200 rounded-lg p-3.5 sm:p-4 hover:shadow-md transition" data-ai-card-layout="aligned-mobile">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h4 className="min-w-0 flex-1 text-base font-semibold leading-snug text-gray-900">{cleanAiText(insight.title)}</h4>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    insight.impact === 'high' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {insight.impact} impact
                  </span>
                </div>
                <p className="mb-2 text-justify text-sm leading-5 text-gray-600 hyphens-auto indent-5" data-ai-text-spacing="justified-even-indent"><AiFormattedText text={summary} /></p>
                {action && (
                  <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-justify text-sm leading-5 text-gray-800 hyphens-auto" data-ai-action-note="justified-even">
                    <strong className="font-semibold">Action:</strong> <AiFormattedText text={action} tone="action" />
                  </p>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 font-medium">{cleanAiText(insight.category)}</span>
                  {confidence && (
                    <span className="text-xs text-gray-400">{confidence}</span>
                  )}
                </div>
              </div>
            )})
          ) : (
            <div className="col-span-2 text-center py-8 text-gray-500">
              No recommendations available. Click "Refresh Analysis" to generate insights.
            </div>
          )}
        </div>
        {insights.length > DEFAULT_AI_ITEMS_VISIBLE && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAllRecommendations((current) => !current)}
              className="px-4 py-2 text-sm font-medium text-[#0F4C75] border border-[#1CA7C9]/30 rounded-lg hover:bg-[#E8F8FC] transition"
            >
              {showAllRecommendations ? 'Show fewer recommendations' : `See all recommendations (${insights.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
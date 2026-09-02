import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '../lib/supabase'
import { createAuditLog, confidenceTone } from '../lib/governance'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')
const MODEL_NAME = 'models/gemini-2.5-flash'

type Insight = {
  title: string
  description: string
  impact: 'low' | 'medium' | 'high' | string
  category: string
  recommended_action?: string
  confidence_score?: number
}

type Anomaly = {
  type: string
  severity: 'low' | 'medium' | 'high' | string
  description: string
  recommendation: string
  establishment?: string
  confidence_score?: number
}

const cleanGeneratedText = (value: unknown, fallback: string) =>
  String(value || fallback).replace(/\s+/g, ' ').trim()

const clampConfidence = (value: unknown, fallback = 0.65) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(1, parsed))
}

const extractJsonObject = (text: string) => {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  return JSON.parse(jsonMatch[0])
}

const safeInsert = async (table: string, payload: Record<string, any>, fallbackPayload?: Record<string, any>) => {
  const { error } = await supabase.from(table).insert(payload)
  if (!error) return

  // Older deployments may not have the new AI confidence/history columns yet.
  // Retry with legacy fields so Gemini features keep working until migration is applied.
  if (fallbackPayload) {
    const retry = await supabase.from(table).insert(fallbackPayload)
    if (!retry.error) return
  }

  console.warn(`${table} insert failed:`, error.message)
}

const normalizeInsights = (items: any[]): Insight[] =>
  items.map((insight) => ({
    title: cleanGeneratedText(insight.title, 'Tourism insight'),
    description: cleanGeneratedText(insight.description, ''),
    impact: String(insight.impact || 'medium').toLowerCase(),
    category: cleanGeneratedText(insight.category, 'Operations'),
    recommended_action: cleanGeneratedText(insight.recommended_action || insight.action, 'Review this trend and take one focused action.'),
    confidence_score: clampConfidence(insight.confidence_score),
  }))

const normalizeAnomalies = (items: any[]): Anomaly[] =>
  items.map((anomaly) => ({
    type: cleanGeneratedText(anomaly.type || anomaly.anomaly_type, 'Operational anomaly'),
    severity: String(anomaly.severity || 'medium').toLowerCase(),
    description: cleanGeneratedText(anomaly.description, ''),
    recommendation: cleanGeneratedText(anomaly.recommendation || anomaly.recommended_action, 'Review this record manually.'),
    establishment: anomaly.establishment ? cleanGeneratedText(anomaly.establishment, '') : undefined,
    confidence_score: clampConfidence(anomaly.confidence_score),
  }))

export const geminiService = {
  async getCachedInsights() {
    const { data, error } = await supabase
      .from('ai_insights_cache')
      .select('data')
      .eq('insight_type', 'recommendations')
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null
    return data.data
  },

  async getCachedAnomalies() {
    const { data, error } = await supabase
      .from('ai_anomalies_cache')
      .select('*')
      .eq('status', 'active')
      .order('detected_at', { ascending: false })

    if (error) return []
    return data || []
  },

  async generateAndSaveInsights(analyticsData: any) {
    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME })
      const prompt = `
        You are a tourism data analyst for Balayan, Batangas.

        Based on this tourism data, provide INSIGHTS AND RECOMMENDATIONS:
        Total Visitors: ${analyticsData.totalVisitors || 0}
        Average Occupancy: ${analyticsData.avgOccupancy || 0}%
        Monthly Trends: ${JSON.stringify(analyticsData.monthlyTrends || {})}

        Return ONLY valid JSON in this exact format:
        {
          "insights": [
            {
              "title": "max 6 words",
              "description": "one sentence, max 18 words, include the key evidence",
              "impact": "high|medium|low",
              "category": "Seasonal|Operations|Marketing|Infrastructure",
              "recommended_action": "one action sentence, max 14 words",
              "confidence_score": 0.0
            }
          ]
        }

        Provide exactly 4 recommendations. Keep every field brief but meaningful. No paragraphs. Avoid generic advice.
      `

      const result = await model.generateContent(prompt)
      const responseText = await result.response.text()
      const parsed = extractJsonObject(responseText)
      const insights = normalizeInsights(parsed?.insights || [])

      for (const insight of insights) {
        const payload = {
          title: insight.title,
          description: insight.description,
          impact: insight.impact,
          category: insight.category,
          recommended_action: insight.recommended_action,
          confidence_score: insight.confidence_score,
          model_name: MODEL_NAME,
          input_snapshot: analyticsData,
          status: 'active',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }
        await safeInsert('ai_recommendations', payload, {
          title: insight.title,
          description: `${insight.description}\n\nRecommended action: ${insight.recommended_action}\nConfidence: ${confidenceTone(insight.confidence_score)} (${insight.confidence_score})`,
          impact: insight.impact,
          category: insight.category,
          status: 'active',
          expires_at: payload.expires_at,
        })
      }

      await safeInsert('ai_insights_cache', {
        insight_type: 'recommendations',
        data: { insights, model_name: MODEL_NAME, input_snapshot: analyticsData },
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }, {
        insight_type: 'recommendations',
        data: { insights },
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })

      await createAuditLog({
        action: 'ai_insights_generated',
        entity_type: 'ai_recommendations',
        new_values: { count: insights.length, model_name: MODEL_NAME },
      })

      return insights
    } catch (error) {
      console.error('Gemini API error:', error)
      return []
    }
  },

  async generateAndSaveInsightsForEstablishment(establishmentData: any) {
    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME })
      const prompt = `
        You are a tourism data analyst for ${establishmentData.establishmentName}.

        Based on this establishment tourism data, provide INSIGHTS AND RECOMMENDATIONS:
        Total Visitors: ${establishmentData.totalVisitors || 0}
        Average Occupancy: ${establishmentData.avgOccupancy || 0}%
        Monthly Trends: ${JSON.stringify(establishmentData.monthlyTrends || {})}

        Return ONLY valid JSON in this exact format:
        {
          "insights": [
            {
              "title": "max 6 words",
              "description": "one sentence, max 18 words, include the key evidence",
              "impact": "high|medium|low",
              "category": "Operations|Marketing|Revenue",
              "recommended_action": "one action sentence, max 14 words",
              "confidence_score": 0.0
            }
          ]
        }

        Provide exactly 3 recommendations. Keep every field brief but meaningful. No paragraphs. Avoid generic advice.
      `

      const result = await model.generateContent(prompt)
      const responseText = await result.response.text()
      const parsed = extractJsonObject(responseText)
      const insights = normalizeInsights(parsed?.insights || [])

      for (const insight of insights) {
        const payload = {
          title: insight.title,
          description: insight.description,
          impact: insight.impact,
          category: insight.category,
          recommended_action: insight.recommended_action,
          confidence_score: insight.confidence_score,
          model_name: MODEL_NAME,
          input_snapshot: establishmentData,
          establishment_id: establishmentData.establishmentId,
          status: 'active',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }
        await safeInsert('ai_recommendations', payload, {
          title: insight.title,
          description: `${insight.description}\n\nRecommended action: ${insight.recommended_action}\nConfidence: ${confidenceTone(insight.confidence_score)} (${insight.confidence_score})`,
          impact: insight.impact,
          category: insight.category,
          establishment_id: establishmentData.establishmentId,
          status: 'active',
          expires_at: payload.expires_at,
        })
      }

      return insights
    } catch (error) {
      console.error('Gemini API error:', error)
      return []
    }
  },

  async generateAndSaveAnomalies(visitorData: any[]) {
    if (!visitorData || visitorData.length === 0) return []

    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME })
      const inputSnapshot = visitorData.slice(0, 50)
      const prompt = `
        You are a tourism data analyst for Balayan, Batangas.

        Analyze this visitor data and identify ANOMALIES:
        ${JSON.stringify(inputSnapshot, null, 2)}

        Return ONLY valid JSON in this exact format:
        {
          "anomalies": [
            {
              "type": "Unusual Drop",
              "severity": "high|medium|low",
              "description": "describe the anomaly",
              "recommendation": "what to do about it",
              "establishment": "exact establishment name, or Municipality-wide if it affects all establishments",
              "confidence_score": 0.0
            }
          ]
        }
      `

      const result = await model.generateContent(prompt)
      const responseText = await result.response.text()
      const parsed = extractJsonObject(responseText)
      const anomalies = normalizeAnomalies(parsed?.anomalies || [])

      for (const anomaly of anomalies) {
        let establishmentId = null
        const establishmentName = anomaly.establishment?.trim()
        const isMunicipalityWide = !establishmentName || /^municipality[-\s]?wide$/i.test(establishmentName)
        if (!isMunicipalityWide) {
          const { data: est } = await supabase
            .from('establishments')
            .select('id')
            .ilike('name', establishmentName)
            .maybeSingle()
          establishmentId = est?.id || null
        }

        await safeInsert('ai_anomalies_cache', {
          anomaly_type: anomaly.type,
          severity: anomaly.severity,
          description: anomaly.description,
          recommendation: anomaly.recommendation,
          establishment_id: establishmentId,
          confidence_score: anomaly.confidence_score,
          model_name: MODEL_NAME,
          input_snapshot: inputSnapshot,
          detected_at: new Date(),
          status: 'active',
          is_resolved: false,
        }, {
          anomaly_type: anomaly.type,
          severity: anomaly.severity,
          description: `${anomaly.description}\n\nConfidence: ${confidenceTone(anomaly.confidence_score)} (${anomaly.confidence_score})`,
          recommendation: anomaly.recommendation,
          establishment_id: establishmentId,
          detected_at: new Date(),
          status: 'active',
          is_resolved: false,
        })
      }

      await createAuditLog({
        action: 'ai_anomalies_generated',
        entity_type: 'ai_anomalies_cache',
        new_values: { count: anomalies.length, model_name: MODEL_NAME },
      })

      return anomalies
    } catch (error) {
      console.error('Gemini API error:', error)
      return []
    }
  },

  async generateAndSaveAnomaliesForEstablishment(visitorData: any[], establishmentId: string, establishmentName: string) {
    if (!visitorData || visitorData.length === 0) return []

    try {
      const model = genAI.getGenerativeModel({ model: MODEL_NAME })
      const inputSnapshot = visitorData.slice(0, 30)
      const prompt = `
        You are a tourism data analyst for ${establishmentName}.

        Analyze this visitor data for this specific establishment and identify ANOMALIES:
        ${JSON.stringify(inputSnapshot, null, 2)}

        Return ONLY valid JSON in this exact format:
        {
          "anomalies": [
            {
              "type": "Unusual Drop",
              "severity": "high|medium|low",
              "description": "describe the anomaly specific to this establishment",
              "recommendation": "what to do about it",
              "confidence_score": 0.0
            }
          ]
        }
      `

      const result = await model.generateContent(prompt)
      const responseText = await result.response.text()
      const parsed = extractJsonObject(responseText)
      const anomalies = normalizeAnomalies(parsed?.anomalies || [])

      for (const anomaly of anomalies) {
        await safeInsert('ai_anomalies_cache', {
          anomaly_type: anomaly.type,
          severity: anomaly.severity,
          description: anomaly.description,
          recommendation: anomaly.recommendation,
          establishment_id: establishmentId,
          confidence_score: anomaly.confidence_score,
          model_name: MODEL_NAME,
          input_snapshot: inputSnapshot,
          detected_at: new Date(),
          status: 'active',
          is_resolved: false,
        }, {
          anomaly_type: anomaly.type,
          severity: anomaly.severity,
          description: `${anomaly.description}\n\nConfidence: ${confidenceTone(anomaly.confidence_score)} (${anomaly.confidence_score})`,
          recommendation: anomaly.recommendation,
          establishment_id: establishmentId,
          detected_at: new Date(),
          status: 'active',
          is_resolved: false,
        })
      }

      return anomalies
    } catch (error) {
      console.error('Gemini API error:', error)
      return []
    }
  },

  async refreshAllData() {
    console.log('🔄 Refreshing AI data...')

    const { data: visitorData } = await supabase
      .from('visitor_reports')
      .select('report_date, total_guests, residence_type, establishments(name)')
      .eq('status', 'approved')
      .order('report_date', { ascending: false })
      .limit(500)

    const { data: accommodationData } = await supabase
      .from('accommodation_reports')
      .select('report_date, total_rooms, total_occupied_rooms')
      .eq('status', 'approved')

    const totalVisitors = visitorData?.reduce((sum, v) => sum + (v.total_guests || 0), 0) || 0
    let avgOccupancy = 0
    if (accommodationData && accommodationData.length > 0) {
      const totalRooms = accommodationData.reduce((sum, a) => sum + (a.total_rooms || 0), 0)
      const totalOccupied = accommodationData.reduce((sum, a) => sum + (a.total_occupied_rooms || 0), 0)
      avgOccupancy = totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0
    }

    const monthlyTrends: Record<string, number> = {}
    visitorData?.forEach(v => {
      if (v.report_date) {
        const month = v.report_date.slice(0, 7)
        monthlyTrends[month] = (monthlyTrends[month] || 0) + (v.total_guests || 0)
      }
    })

    const [insights, anomalies] = await Promise.all([
      this.generateAndSaveInsights({ totalVisitors, avgOccupancy, monthlyTrends }),
      this.generateAndSaveAnomalies(visitorData || [])
    ])

    console.log('✅ AI data refreshed:', { insights: insights.length, anomalies: anomalies.length })
    return { insights, anomalies }
  }
}
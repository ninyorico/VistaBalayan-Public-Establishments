import type { ReactNode } from 'react'
import { cleanAiText } from '../../lib/aiText'

interface AiFormattedTextProps {
  text?: string | null
  className?: string
  tone?: 'body' | 'action'
}

const EMPHASIS_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|\b(?:high|urgent|critical|increase|decrease|decline|growth|peak|low|risk|opportunity|action|recommend|monitor|improve|review|visitors?|occupancy|reports?)\b|\d+(?:\.\d+)?%?)/gi

const renderSegment = (segment: string, key: string, tone: AiFormattedTextProps['tone']): ReactNode => {
  if (!segment) return null

  if (segment.startsWith('**') && segment.endsWith('**')) {
    return (
      <strong key={key} className="font-semibold text-gray-950">
        {cleanAiText(segment.slice(2, -2))}
      </strong>
    )
  }

  if (segment.startsWith('*') && segment.endsWith('*')) {
    return (
      <em key={key} className="italic text-gray-700">
        {cleanAiText(segment.slice(1, -1))}
      </em>
    )
  }

  if (/^\d/.test(segment)) {
    return (
      <strong key={key} className="font-semibold text-[#0F4C75]">
        {segment}
      </strong>
    )
  }

  if (/^(high|urgent|critical|risk)$/i.test(segment)) {
    return (
      <strong key={key} className="font-semibold text-red-700">
        {segment}
      </strong>
    )
  }

  if (tone === 'action' || /^(action|recommend|monitor|improve|review)$/i.test(segment)) {
    return (
      <strong key={key} className="font-semibold text-gray-950">
        {segment}
      </strong>
    )
  }

  return (
    <em key={key} className="italic text-gray-700">
      {segment}
    </em>
  )
}

export function AiFormattedText({ text, className = '', tone = 'body' }: AiFormattedTextProps) {
  const cleaned = cleanAiText(text)

  if (!cleaned) return null

  const parts = cleaned.split(EMPHASIS_PATTERN).filter(Boolean)

  return (
    <span className={className} data-ai-formatted-text="true">
      {parts.map((part, index) => renderSegment(part, `${part}-${index}`, tone))}
    </span>
  )
}

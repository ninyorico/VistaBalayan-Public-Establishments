import type { ReactNode } from 'react'
import { cleanAiText } from '../../lib/aiText'

interface AiFormattedTextProps {
  text?: string | null
  className?: string
  tone?: 'body' | 'action'
}

type EmphasisKind = 'bold' | 'italic' | 'number' | 'risk' | 'action'

const TOKEN_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|\b(?:high|urgent|critical|risk)\b|\b(?:action|recommend|review|improve|monitor)\b|\d+(?:\.\d+)?%?)/gi

const classifyToken = (token: string, tone: AiFormattedTextProps['tone']): EmphasisKind | null => {
  if (token.startsWith('**') && token.endsWith('**')) return 'bold'
  if (token.startsWith('*') && token.endsWith('*')) return 'italic'
  if (/^\d/.test(token)) return 'number'
  if (/^(high|urgent|critical|risk)$/i.test(token)) return 'risk'
  if (/^(action|recommend|review|improve|monitor)$/i.test(token)) return 'action'
  if (tone === 'action' && /^(submit|update|check|fix|prepare|contact)$/i.test(token)) return 'action'
  return null
}

const renderEmphasis = (token: string, kind: EmphasisKind, key: string): ReactNode => {
  const label = kind === 'bold'
    ? cleanAiText(token.slice(2, -2))
    : kind === 'italic'
      ? cleanAiText(token.slice(1, -1))
      : token

  if (!label) return null

  if (kind === 'italic') {
    return <em key={key} className="italic text-gray-700">{label}</em>
  }

  const className = kind === 'risk'
    ? 'font-semibold text-red-700'
    : kind === 'number'
      ? 'font-semibold text-[#0F4C75]'
      : 'font-semibold text-gray-950'

  return <strong key={key} className={className}>{label}</strong>
}

export function AiFormattedText({ text, className = '', tone = 'body' }: AiFormattedTextProps) {
  const cleaned = cleanAiText(text)

  if (!cleaned) return null

  const pieces: ReactNode[] = []
  let lastIndex = 0

  for (const match of cleaned.matchAll(TOKEN_PATTERN)) {
    const token = match[0]
    const index = match.index ?? 0

    if (index > lastIndex) {
      pieces.push(cleaned.slice(lastIndex, index))
    }

    const kind = classifyToken(token, tone)
    pieces.push(kind ? renderEmphasis(token, kind, `${token}-${index}`) : token)
    lastIndex = index + token.length
  }

  if (lastIndex < cleaned.length) {
    pieces.push(cleaned.slice(lastIndex))
  }

  return (
    <span className={className} data-ai-formatted-text="compact">
      {pieces.length > 0 ? pieces : cleaned}
    </span>
  )
}

export function sortPublicEstablishments(establishments, summaries, sort = 'recommended') {
  const values = Array.isArray(establishments) ? establishments : []
  if (sort === 'recommended') return values
  return [...values].sort((a, b) => {
    if (sort === 'name') return String(a?.name || '').localeCompare(String(b?.name || ''))
    const aSummary = summaries?.[a.id]
    const bSummary = summaries?.[b.id]
    if (sort === 'rating') {
      return (bSummary?.average ?? -1) - (aSummary?.average ?? -1) || String(a?.name || '').localeCompare(String(b?.name || ''))
    }
    return (bSummary?.count ?? 0) - (aSummary?.count ?? 0) || String(a?.name || '').localeCompare(String(b?.name || ''))
  })
}

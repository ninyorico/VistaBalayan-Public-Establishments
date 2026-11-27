export function sortPublicEstablishments(establishments, summaries, sort = 'recommended') {
  const values = Array.isArray(establishments) ? establishments : []
  return [...values].sort((a, b) => {
    const aSummary = summaries?.[a.id]
    const bSummary = summaries?.[b.id]
    if (sort === 'name') return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    if (sort === 'rating') {
      return (bSummary?.count ? bSummary.average : -1) - (aSummary?.count ? aSummary.average : -1)
        || (bSummary?.count ?? 0) - (aSummary?.count ?? 0)
        || String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    }
    if (sort === 'reviews') {
      return (bSummary?.count ?? 0) - (aSummary?.count ?? 0)
        || (bSummary?.average ?? -1) - (aSummary?.average ?? -1)
        || String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    }
    return Number(Boolean(b?.featured)) - Number(Boolean(a?.featured))
      || (bSummary?.count ?? 0) - (aSummary?.count ?? 0)
      || (bSummary?.average ?? -1) - (aSummary?.average ?? -1)
      || String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
  })
}

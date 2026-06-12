export async function fetchAllPages(buildQuery, { pageSize = 1000, maxPages = 100 } = {}) {
  const rows = []

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await buildQuery().range(from, to)

    if (error) return { data: rows, error }

    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)

    if (batch.length < pageSize) return { data: rows, error: null }
  }

  return {
    data: rows,
    error: new Error(`Limite de paginação atingido (${maxPages} páginas).`),
  }
}
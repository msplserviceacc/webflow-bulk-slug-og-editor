
import React, { useEffect, useMemo, useState } from 'react'

// Webflow App SDK
const sdk: any = (globalThis as any)?.webflow?.app

type PageRow = {
  id: string
  name: string
  currentSlug: string
  newSlug: string
  currentOgImage: string | null
  newOgImage: string | null
  updated: boolean
}

type ApiPage = {
  id: string
  title: string
  slug: string
  collectionId?: string
  seo?: { openGraph?: { image?: { url?: string } } }
}

function toCSV(rows: PageRow[]) {
  const header = ['Name','Current Slug','New Slug','Current OG Image','New OG Image']
  const esc = (v: any) => {
    const s = (v ?? '').toString()
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
  }
  return [header.join(','), ...rows.map(r => [r.name, r.currentSlug, r.newSlug, r.currentOgImage ?? '', r.newOgImage ?? ''].map(esc).join(','))].join('\n')
}

function fromCSV(text: string) {
  const lines = text.replace(/\r/g,'').split('\n').filter(Boolean)
  if (!lines.length) return [] as any[]
  const header = lines.shift()!.split(',').map(h => h.trim().replace(/^\"|\"$/g,''))
  const idx = (k: string) => header.findIndex(h => h.toLowerCase() === k.toLowerCase())
  const iName = idx('Name')
  const iNewSlug = idx('New Slug')
  const iNewOG = idx('New OG Image')

  const smartSplit = (row: string) => {
    const out: string[] = []; let cur = ''; let q = false
    for (let i=0;i<row.length;i++){
      const ch = row[i]
      if (ch === '"') { if (q && row[i+1] === '"') { cur += '"'; i++; } else { q = !q } }
      else if (ch === ',' && !q) { out.push(cur); cur = '' }
      else { cur += ch }
    }
    out.push(cur)
    return out
  }

  return lines.map(line => {
    const cols = smartSplit(line).map(c => c.replace(/^\"|\"$/g,''))
    return { name: cols[iName], newSlug: cols[iNewSlug], newOgImage: cols[iNewOG] }
  })
}

export default function App() {
  const [siteId, setSiteId] = useState<string>('')
  const [rows, setRows] = useState<PageRow[]>([])
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creatingRedirects, setCreatingRedirects] = useState(true)
  const filtered = useMemo(() => rows.filter(r => !onlyChanged || r.updated), [rows, onlyChanged])

  useEffect(() => {
    (async () => {
      setLoading(true)
      const ctx = await sdk?.getSurfaceContext?.()
      const sid = ctx?.context?.siteId
      setSiteId(sid)
      const res = await sdk.api(`/v2/sites/${sid}/pages?limit=200`)
      const data = await res.json()
      const pages: ApiPage[] = (data?.pages || []).filter((p: any) => !p.collectionId)
      const mapped: PageRow[] = pages.map(p => ({
        id: p.id,
        name: p.title,
        currentSlug: p.slug,
        newSlug: p.slug,
        currentOgImage: p.seo?.openGraph?.image?.url || null,
        newOgImage: p.seo?.openGraph?.image?.url || null,
        updated: false,
      }))
      setRows(mapped)
      setLoading(false)
    })()
  }, [])

  function setCell(id: string, patch: Partial<PageRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch, updated: true } : r))
  }

  async function applyChanges() {
    setLoading(true)
    try {
      for (const r of rows) {
        if (!r.updated) continue
        const body: any = {
          slug: r.newSlug,
          seo: { openGraph: { image: { url: r.newOgImage || undefined } } },
        }
        await sdk.api(`/v2/pages/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        if (creatingRedirects && r.currentSlug != r.newSlug) {
          const from = `/${r.currentSlug}`
          const to = `/${r.newSlug}`
          await sdk.api(`/v2/sites/${siteId}/redirects`, { method: 'POST', body: JSON.stringify({ rules: [{ from, to, status: 301 }] }) })
        }
      }
      alert('Updates applied. Refreshing…')
      const res = await sdk.api(`/v2/sites/${siteId}/pages?limit=200`)
      const data = await res.json()
      const pages: ApiPage[] = (data?.pages || []).filter((p: any) => !p.collectionId)
      setRows(pages.map(p => ({
        id: p.id,
        name: p.title,
        currentSlug: p.slug,
        newSlug: p.slug,
        currentOgImage: p.seo?.openGraph?.image?.url || null,
        newOgImage: p.seo?.openGraph?.image?.url || null,
        updated: false,
      })))
    } catch (e: any) {
      console.error(e); alert('Failed: ' + (e?.message || 'Unknown error'))
    } finally { setLoading(false) }
  }

  function exportCSV() {
    const csv = toCSV(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pages-slug-og.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function onImportCSV(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const imported = fromCSV(text)
      setRows(prev => prev.map(r => {
        const match = imported.find((i:any) => (i.name||'').trim().toLowerCase() === r.name.trim().toLowerCase())
        if (!match) return r
        const patch: Partial<PageRow> = {}
        if (match.newSlug) patch.newSlug = match.newSlug
        if (typeof match.newOgImage === 'string' && match.newOgImage.length) patch.newOgImage = match.newOgImage
        return { ...r, ...patch, updated: true }
      }))
    }
    reader.readAsText(file)
    ev.target.value = ''
  }

  return (
    <div style={{ padding: 12, fontSize: 14 }}>
      <div className="bar">
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Bulk Slug + OG Editor</h1>
        <div className="right">
          <label><input type="checkbox" checked={onlyChanged} onChange={e=>setOnlyChanged(e.target.checked)} /> Show changed only</label>
          <label><input type="checkbox" checked={creatingRedirects} onChange={e=>setCreatingRedirects(e.target.checked)} /> Auto-create 301s</label>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          <label className="btn">
            Import CSV
            <input type="file" accept=".csv" onChange={onImportCSV} style={{ display:'none' }} />
          </label>
          <button className="btn btn-primary" disabled={loading} onClick={applyChanges}>{loading? 'Working…' : 'Save Changes'}</button>
        </div>
      </div>
      <div className="table">
        <div className="grid header">
          <div>Name</div><div>Current Slug</div><div>New Slug</div><div>Current OG Image</div><div>New OG Image (URL)</div>
        </div>
        <div className="scroll">
          {filtered.map(r => (
            <div key={r.id} className={"grid row " + (r.updated? "changed": "")}>
              <div className="truncate" title={r.name}>{r.name}</div>
              <div className="truncate" title={r.currentSlug}>/{r.currentSlug}</div>
              <div><input type="text" value={r.newSlug} onChange={e=>setCell(r.id,{ newSlug: e.target.value })}/></div>
              <div className="truncate" title={r.currentOgImage ?? ''}>{r.currentOgImage ?? '—'}</div>
              <div><input type="text" value={r.newOgImage ?? ''} onChange={e=>setCell(r.id,{ newOgImage: e.target.value })} placeholder="https://…/image.jpg"/></div>
            </div>
          ))}
        </div>
      </div>
      <p style={{ color: '#666', marginTop: 8 }}>Tip: CSV columns “Name, New Slug, New OG Image”.</p>
    </div>
  )
}

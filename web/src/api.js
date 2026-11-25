// Thin client for the Crop Advisor FastAPI backend.
// Same-origin by default (Vite dev proxy / nginx in Docker). Set VITE_API_URL to host the API elsewhere.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

let deviceId = 'anonymous'
export const setDeviceId = (id) => { deviceId = id }
export const imageUrl = (path) => (path?.startsWith('http') ? path : `${BASE}${path}`)

async function request(path, { body, method = body ? 'POST' : 'GET', form } = {}) {
  const headers = { 'X-Device-Id': deviceId }
  if (body) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) })
  } catch {
    throw new Error("Can't reach the Crop Advisor server. Check that the backend is running.")
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const d = await res.json()
      if (d?.detail) msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
    } catch { /* not json */ }
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  health: () => request('/health'),
  recheckModel: () => request('/api/ai/recheck', { method: 'POST' }),
  analyze: (file, { crop, notes, lang }) => {
    const form = new FormData()
    form.append('image', file, file.name || 'plant.jpg')
    if (crop) form.append('crop', crop)
    if (notes) form.append('notes', notes)
    form.append('lang', lang)
    return request('/api/analyze', { method: 'POST', form })
  },
  list: (favorite) => request(`/api/analyses${favorite === undefined ? '' : `?favorite=${favorite}`}`),
  get: (id) => request(`/api/analyses/${id}`),
  setFavorite: (id, favorite) => request(`/api/analyses/${id}/favorite`, { method: 'PATCH', body: { favorite } }),
  remove: (id) => request(`/api/analyses/${id}`, { method: 'DELETE' }),
  chat: (payload) => request('/api/chat', { body: payload }),
  fertilizer: (payload) => request('/api/fertilizer', { body: payload }),
  crops: () => request('/api/crops'),
  guides: () => request('/api/guides'),
  guide: (id) => request(`/api/guides/${id}`),
  stats: () => request('/api/stats'),
}

/** Read an image file as base64 (resized) for chat attachments. */
export function fileToDataUrl(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * s)
      c.height = Math.round(img.height * s)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = url
  })
}

// Thin client for the Crop Advisor FastAPI backend.
// Same-origin by default (Vite dev proxy / nginx in Docker). Set VITE_API_URL to host the API elsewhere.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

let deviceId = 'anonymous'
export const setDeviceId = (id) => { deviceId = id }

// Sign-in token from /api/auth/login or /register, sent on every request.
let token = null
export const setToken = (t) => { token = t }
let onSignedOut = () => {}
/** Called when the server says the session has ended, so the app can show the sign-in page. */
export const setOnSignedOut = (fn) => { onSignedOut = fn }
export const imageUrl = (path) => (path?.startsWith('http') ? path : `${BASE}${path}`)

async function request(path, { body, method = body ? 'POST' : 'GET', form } = {}) {
  const headers = { 'X-Device-Id': deviceId }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) })
  } catch {
    const e = new Error("Can't reach the Crop Advisor server. Check that the backend is running.")
    e.code = 'network'
    throw e
  }
  if (res.status === 401 && token) onSignedOut()
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const d = await res.json()
      if (d?.detail) msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
    } catch { /* not json */ }
    const e = new Error(msg)
    e.status = res.status // lets the screens show a translated message (see i18n errorText)
    throw e
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  health: () => request('/health'),
  register: (name, identifier, password) => request('/api/auth/register', { body: { name, identifier, password } }),
  login: (identifier, password) => request('/api/auth/login', { body: { identifier, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
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

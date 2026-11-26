import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, imageUrl, setDeviceId } from './api.js'

const json = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('api client', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setDeviceId('web-test-device-1234')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('sends the device id on every request, so each device only sees its own scans', async () => {
    fetchMock.mockReturnValue(json(200, []))
    await api.list()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/analyses')
    expect(init.headers['X-Device-Id']).toBe('web-test-device-1234')
  })

  it("shows the server's own message, e.g. when a photo has no plant in it", async () => {
    const detail = "This photo doesn't show a plant, so it wasn't analysed."
    fetchMock.mockReturnValue(json(422, { detail }))
    await expect(api.analyze(new Blob(['x']), { lang: 'en' })).rejects.toThrow(detail)
  })

  it('explains the hourly limit when the server says too many requests', async () => {
    fetchMock.mockReturnValue(json(429, { detail: 'Too many requests. You can make 30 of these per hour; try again in 12 min.' }))
    await expect(api.chat({ messages: [] })).rejects.toThrow(/per hour/)
  })

  it('gives a clear message when the server cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.stats()).rejects.toThrow("Can't reach the Crop Advisor server")
  })

  it('falls back to the status code when the error body is not JSON', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('Bad gateway', { status: 502 })))
    await expect(api.crops()).rejects.toThrow('Request failed (502)')
  })

  it('sends a photo as multipart form data with crop, notes and language', async () => {
    fetchMock.mockReturnValue(json(200, { id: 'a1' }))
    await api.analyze(new File(['img'], 'leaf.jpg', { type: 'image/jpeg' }), { crop: 'tomato', notes: 'spots', lang: 'zu' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/analyze')
    expect(init.method).toBe('POST')
    expect(init.body.get('crop')).toBe('tomato')
    expect(init.body.get('lang')).toBe('zu')
    expect(init.body.get('image').name).toBe('leaf.jpg')
    expect(init.headers['Content-Type']).toBeUndefined() // the browser sets the multipart boundary
  })

  it('returns nothing for a successful delete (204)', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })))
    await expect(api.remove('a1')).resolves.toBeNull()
  })

  it('keeps absolute photo URLs and prefixes relative ones', () => {
    expect(imageUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg')
    expect(imageUrl('/uploads/abc.jpg')).toBe('/uploads/abc.jpg')
  })
})

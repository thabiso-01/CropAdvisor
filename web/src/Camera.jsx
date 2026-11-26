import { Camera, RefreshCw, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useT } from './store.jsx'

const hasLiveCamera = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia

/**
 * Whether "Take photo" opens the live camera in the page (true), or the device's own camera app
 * through <input capture> (false). Phones use their camera app when the page can't open the camera
 * itself (browsers only allow that on https or localhost). Computers always get the in-page camera,
 * which explains what to do if the browser blocks it, instead of silently opening a file picker.
 */
export function canUseLiveCamera() {
  if (hasLiveCamera()) return true
  return !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
}

/** A live camera preview with a shutter button. Calls onCapture with a JPEG File. */
export function CameraModal({ open, onClose, onCapture, onUseFile }) {
  const t = useT()
  const video = useRef()
  const [stream, setStream] = useState(null)
  const [facing, setFacing] = useState('environment')
  const [cameras, setCameras] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    let live = null
    let cancelled = false
    setErr('')
    setStream(null)
    if (!hasLiveCamera()) {
      setErr(t(window.isSecureContext ? 'camera.none' : 'camera.insecure'))
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop())
        live = s
        setStream(s)
        navigator.mediaDevices.enumerateDevices?.()
          .then((d) => setCameras(d.filter((x) => x.kind === 'videoinput').length))
          .catch(() => {})
      })
      .catch((e) => {
        if (cancelled) return
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') setErr(t('camera.denied'))
        else if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') setErr(t('camera.none'))
        else if (e?.name === 'NotReadableError') setErr(t('camera.busy'))
        else setErr(t('camera.failed'))
      })
    return () => {
      cancelled = true
      live?.getTracks().forEach((tr) => tr.stop())
    }
  }, [open, facing, t])

  useEffect(() => {
    if (video.current && stream) video.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])

  if (!open) return null

  const snap = () => {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    c.toBlob((b) => {
      if (!b) return setErr(t('camera.failed'))
      onCapture(new File([b], `plant-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      onClose()
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="modal-back camera-back" onClick={onClose}>
      <div className="camera" role="dialog" aria-modal="true" aria-label={t('camera.title')} onClick={(e) => e.stopPropagation()}>
        <div className="camera-head">
          <h2>{t('camera.title')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={18} /></button>
        </div>
        <div className="camera-view">
          {err ? (
            <div className="camera-msg">
              <p>{err}</p>
              {onUseFile && <button type="button" className="btn light" onClick={() => { onClose(); onUseFile() }}><Upload size={17} /> {t('camera.useFile')}</button>}
            </div>
          ) : (
            <>
              <video ref={video} autoPlay playsInline muted />
              {!stream && <div className="camera-msg"><div className="spin" /><p>{t('camera.starting')}</p></div>}
            </>
          )}
        </div>
        {!err && (
          <div className="camera-bar">
            <span />
            <button type="button" className="shutter" onClick={snap} disabled={!stream} aria-label={t('camera.capture')}><Camera size={26} /></button>
            {cameras > 1
              ? <button type="button" className="icon-btn" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label={t('camera.switch')}><RefreshCw size={20} /></button>
              : <span />}
          </div>
        )}
      </div>
    </div>
  )
}

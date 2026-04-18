import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { relationalBackendEnabled } from '../lib/backendMode'
import { supabase } from '../lib/supabase'
import {
  CASE_ATTACHMENT_SIGNED_URL_EXPIRES_SEC,
  createCaseAttachmentSignedUrl,
} from '../lib/relational/storageAttachment'
import type { CaseAttachment } from '../lib/types'

const SIGNED_URL_REFRESH_MS = Math.floor(CASE_ATTACHMENT_SIGNED_URL_EXPIRES_SEC * 1000 * 0.75)

type Props = {
  attachment: CaseAttachment
  alt?: string
  style?: CSSProperties
  className?: string
}

/** Resolves `imageDataUrl` or a signed URL for `imageStoragePath` (relational + storage). */
export function CaseAttachmentImage(props: Props) {
  const { attachment: a, alt = '', style, className } = props
  const [src, setSrc] = useState(() => (a.imageDataUrl?.trim() ? a.imageDataUrl : ''))
  const [failed, setFailed] = useState(false)
  const storageErrorRetryRef = useRef(false)

  useEffect(() => {
    storageErrorRetryRef.current = false
    if (a.imageDataUrl?.trim()) {
      setSrc(a.imageDataUrl)
      setFailed(false)
      return
    }
    const path = a.imageStoragePath?.trim()
    if (!path || !relationalBackendEnabled() || !supabase) {
      setSrc('')
      return
    }
    const client = supabase
    let cancelled = false
    setFailed(false)
    const loadSigned = async () => {
      const signed = await createCaseAttachmentSignedUrl(client, path)
      if (!cancelled) {
        if (signed) setSrc(signed)
        else setFailed(true)
      }
    }
    void loadSigned()
    const intervalId = window.setInterval(() => {
      void loadSigned()
    }, SIGNED_URL_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [a.id, a.imageDataUrl, a.imageStoragePath])

  if (failed) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 12 }}>
        Could not load image
      </div>
    )
  }
  if (!src) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
        Loading…
      </div>
    )
  }
  const path = a.imageStoragePath?.trim()
  const onImgError = () => {
    if (a.imageDataUrl?.trim()) {
      setFailed(true)
      return
    }
    if (!path || !relationalBackendEnabled() || !supabase) {
      setFailed(true)
      return
    }
    const client = supabase
    if (storageErrorRetryRef.current) {
      setFailed(true)
      return
    }
    storageErrorRetryRef.current = true
    void (async () => {
      const signed = await createCaseAttachmentSignedUrl(client, path)
      if (signed) setSrc(signed)
      else setFailed(true)
    })()
  }

  return <img src={src} alt={alt} style={style} className={className} onError={onImgError} />
}

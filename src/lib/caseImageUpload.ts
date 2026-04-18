/** Client-side resize/compress before storing in JSON (keeps shared `vc_app_state` payload smaller). */

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_EDGE_PX = 1920
const JPEG_QUALITY = 0.82
/** Rough cap on stored data URL length (~2.5MB string) to avoid huge Supabase rows. */
const MAX_DATA_URL_CHARS = 2_600_000

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = src
  })
}

/**
 * Reads an image file, downscales long edge to {@link MAX_EDGE_PX}, encodes as JPEG.
 * @throws If file is missing, too large, not an image, or result still exceeds {@link MAX_DATA_URL_CHARS}.
 */
export async function processCaseImageFile(file: File): Promise<string> {
  if (!file.size) throw new Error('Empty file')
  if (file.size > MAX_FILE_BYTES) throw new Error(`Image must be under ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB`)
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file')

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!w || !h) throw new Error('Invalid image dimensions')

    let tw = w
    let th = h
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(w, h))
    if (scale < 1) {
      tw = Math.round(w * scale)
      th = Math.round(h * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not available')
    ctx.drawImage(img, 0, 0, tw, th)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    if (dataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('Image is still too large after compressing — try a smaller original')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

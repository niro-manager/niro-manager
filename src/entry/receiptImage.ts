import type { ReceiptImage } from '../sheets/sheetsClient'

// 영수증 사진을 서버로 보내기 전에 브라우저에서 줄이고 JPEG로 압축한다. 사진은 기기에 저장하지 않는다.
export const RECEIPT_MAX_SIDE = 1600
const JPEG_QUALITY = 0.85

/** 긴 변이 maxSide를 넘으면 비율을 유지해 줄인 크기. 작은 사진은 키우지 않는다 */
export function fitWithin(width: number, height: number, maxSide = RECEIPT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // 휴대폰 사진의 회전 정보(EXIF)를 반영한다.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 고른 사진을 긴 변 1600px 안팎의 JPEG base64로 바꾼다. 읽을 수 없는 형식이면 예외 */
export async function prepareReceiptImage(file: Blob): Promise<ReceiptImage> {
  let decoded
  try {
    decoded = await decode(file)
  } catch {
    throw new Error('사진을 열 수 없습니다. JPEG·PNG 사진으로 다시 골라 주세요.')
  }
  try {
    const size = fitWithin(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('사진을 줄일 수 없습니다.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, size.width, size.height)
    context.drawImage(decoded.source, 0, 0, size.width, size.height)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (!dataUrl.startsWith('data:image/jpeg') || base64 === '') throw new Error('사진을 줄일 수 없습니다.')
    return { base64, mimeType: 'image/jpeg' }
  } finally {
    decoded.close()
  }
}

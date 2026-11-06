import type { ReceiptOcr } from '../sheets/sheetsClient'
import { formatWon } from '../format'

/** Drive 인식으로 바꾼 이유를 화면에 보여 줄 문장. Gemini로 읽었으면 null */
export function fallbackMessage(ocr: Pick<ReceiptOcr, 'engine' | 'fallback' | 'geminiStatus'>): string | null {
  if (ocr.engine !== 'drive' || ocr.fallback === null) return null
  switch (ocr.fallback) {
    case 'no-key':
      return 'Gemini 키가 설정되지 않아 Drive 인식으로 읽었습니다.'
    case 'quota':
      return 'Gemini 무료 사용 한도를 넘어(HTTP 429) Drive 인식으로 읽었습니다.'
    case 'network':
      return 'Gemini에 연결하지 못해 Drive 인식으로 읽었습니다.'
    case 'failed':
      if (ocr.geminiStatus !== null && [500, 502, 503, 504].includes(ocr.geminiStatus)) {
        return `Gemini 서버가 혼잡해(HTTP ${ocr.geminiStatus}) Drive 인식으로 읽었습니다. 잠시 뒤 다시 찍으면 Gemini로 읽을 수 있습니다.`
      }
      return ocr.geminiStatus === 200
        ? 'Gemini 응답을 해석하지 못해 Drive 인식으로 읽었습니다.'
        : `Gemini 요청이 실패해${ocr.geminiStatus === null ? '' : `(HTTP ${ocr.geminiStatus})`} Drive 인식으로 읽었습니다.`
  }
}

/** 단가·리터를 다 얻지 못했을 때 결제액을 참고로 보여 줄 문장 */
export function paidReferenceMessage(paid: number): string {
  return `영수증 결제액 ${formatWon(paid)} — 단가·리터를 입력하면 주유비가 계산됩니다.`
}

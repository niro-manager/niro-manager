/** 브라우저가 오프라인이라고 알리면 시트 요청을 시도하지 않는다. 입력 내용은 임시 보관돼 있다 */
export const OFFLINE_MESSAGE = '오프라인이라 저장할 수 없습니다. 입력 내용은 이 기기에 보관해 두었으니 연결된 뒤 다시 눌러 주세요.'

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

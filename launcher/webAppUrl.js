// 런처가 기기에 보관하는 Apps Script 웹 앱 주소.
// 주소는 이 기기의 localStorage에만 두고 저장소·커밋에는 넣지 않는다(공개 저장소).

export const STORAGE_KEY = 'niro-manager.launcher.webAppUrl'

const WEB_APP_URL = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/

/** 앞뒤 공백을 지운 주소가 Apps Script 웹 앱 배포 주소(/exec) 형식이면 그 주소, 아니면 null. */
export function normalizeWebAppUrl(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return WEB_APP_URL.test(trimmed) ? trimmed : null
}

/** 저장된 주소. 없거나 형식이 맞지 않거나 저장소를 쓸 수 없으면 null. */
export function loadWebAppUrl(storage) {
  try {
    return normalizeWebAppUrl(storage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/** 형식이 맞으면 저장하고 저장한 주소를, 아니면 저장하지 않고 null을 돌려준다. 저장 실패는 예외로 알린다. */
export function saveWebAppUrl(storage, value) {
  const url = normalizeWebAppUrl(value)
  if (url) storage.setItem(STORAGE_KEY, url)
  return url
}

export function clearWebAppUrl(storage) {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

/** ?setup=1 이면 저장된 주소가 있어도 이동하지 않고 입력 화면을 보여준다. */
export function isSetupRequested(search) {
  return new URLSearchParams(search).get('setup') === '1'
}

// 열기 방식: 'embed'(런처 안에 iframe으로 끼워 넣기, 기본) 또는 'direct'(웹 앱 주소로 직접 이동).
export const OPEN_MODE_KEY = 'niro-manager.launcher.openMode'
export const OPEN_MODES = ['embed', 'direct']

/** 저장된 열기 방식. 없거나 알 수 없는 값이거나 저장소를 쓸 수 없으면 기본값 'embed'. */
export function loadOpenMode(storage) {
  try {
    const mode = storage.getItem(OPEN_MODE_KEY)
    return OPEN_MODES.includes(mode) ? mode : 'embed'
  } catch {
    return 'embed'
  }
}

/** 알려진 값이면 저장하고 그 값을, 아니면 저장하지 않고 null을 돌려준다. 저장 실패는 예외로 알린다. */
export function saveOpenMode(storage, mode) {
  if (!OPEN_MODES.includes(mode)) return null
  storage.setItem(OPEN_MODE_KEY, mode)
  return mode
}

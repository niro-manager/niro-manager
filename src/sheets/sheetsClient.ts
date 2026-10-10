import type { CellValue } from '../domain/cells'

// Sheets 어댑터: Sheets API 요청과 오류 구분을 담당한다. UI는 이 모듈을 통해서만 시트를 읽는다.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

export type SheetsErrorKind = 'auth' | 'access' | 'notFound' | 'network' | 'api'

export class SheetsError extends Error {
  readonly kind: SheetsErrorKind
  readonly status: number | null

  constructor(kind: SheetsErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'SheetsError'
    this.kind = kind
    this.status = status
  }
}

/** 탭 이름을 A1 표기용으로 감싼다. 작은따옴표는 두 번 쓴다. */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

export function buildBatchGetUrl(spreadsheetId: string, ranges: string[]): string {
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS' })
  for (const range of ranges) params.append('ranges', range)
  return `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`
}

interface BatchGetResponse {
  valueRanges?: { range?: string; values?: CellValue[][] }[]
}

async function request<T>(accessToken: string, url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } })
  } catch {
    throw new SheetsError('network', '네트워크에 연결할 수 없습니다.')
  }
  if (!response.ok) {
    const detail = await readErrorMessage(response)
    if (response.status === 401) throw new SheetsError('auth', '로그인이 만료되었습니다. 다시 로그인해 주세요.', 401)
    if (response.status === 403) throw new SheetsError('access', `이 파일에 접근할 권한이 없습니다. 설정에서 파일을 다시 선택해 주세요.${detail}`, 403)
    if (response.status === 404) throw new SheetsError('notFound', `스프레드시트를 찾을 수 없습니다. 설정에서 파일을 다시 선택해 주세요.${detail}`, 404)
    if (response.status === 400) throw new SheetsError('api', `요청이 거부되었습니다. 탭 이름을 확인해 주세요.${detail}`, 400)
    throw new SheetsError('api', `Google Sheets 요청이 실패했습니다(${response.status}).${detail}`, response.status)
  }
  return (await response.json()) as T
}

/** 여러 범위의 값을 읽는다. 결과는 요청한 범위 순서와 같다. 값이 없는 범위는 빈 배열이다. */
export async function batchGetValues(
  accessToken: string,
  spreadsheetId: string,
  ranges: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<CellValue[][][]> {
  const body = await request<BatchGetResponse>(accessToken, buildBatchGetUrl(spreadsheetId, ranges), { method: 'GET' }, fetchImpl)
  const valueRanges = body.valueRanges ?? []
  return ranges.map((_, index) => valueRanges[index]?.values ?? [])
}

/** 탭 이름으로 숫자 sheetId를 찾는다. 없으면 null. */
export async function getSheetId(accessToken: string, spreadsheetId: string, sheetName: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent('sheets.properties(sheetId,title)')}`
  const body = await request<{ sheets?: { properties?: { sheetId?: number; title?: string } }[] }>(accessToken, url, { method: 'GET' }, fetchImpl)
  const sheet = body.sheets?.find((s) => s.properties?.title === sheetName)
  return sheet?.properties?.sheetId ?? null
}

/** spreadsheets.batchUpdate. 요청들은 순서대로, 전부 적용되거나 전부 적용되지 않는다. */
export async function batchUpdate(accessToken: string, spreadsheetId: string, requests: unknown[], fetchImpl: typeof fetch = fetch): Promise<void> {
  await request<unknown>(
    accessToken,
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) },
    fetchImpl,
  )
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ? ` (${body.error.message})` : ''
  } catch {
    return ''
  }
}

// Niro Manager — Apps Script 서버 코드.
// 차계부 스프레드시트에 연결된(컨테이너 바인딩) 스크립트로 넣고, 웹 앱으로 배포한다.
// 배포 설정: "다음 사용자 인증 정보로 실행: 나", "액세스 권한: 나만". 안내는 docs/APPS_SCRIPT_SETUP.md.
// 시트 읽기·쓰기는 Sheets 고급 서비스(appsscript.json)로 한다. 앱(index.html)이 만든 batchUpdate 요청을 그대로 적용한다.

/** 웹 앱 첫 화면. index.html은 npm run build로 만든 한 파일짜리 앱이다. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Niro Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
}

function spreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  if (!ss) throw new Error('[notFound] 스크립트가 스프레드시트에 연결되어 있지 않습니다. 차계부에서 확장 프로그램 → Apps Script로 만든 스크립트에 넣어 주세요.')
  return ss
}

/** 연결된 스프레드시트 이름. 이름에 "복사본"이 있으면 앱은 테스트용 복사본으로 표시한다. */
function getInfo() {
  return { name: spreadsheet_().getName() }
}

/** 여러 범위를 계산 결과와 날짜 직렬값으로 읽는다. 결과는 범위 순서와 같다. */
function batchGetValues(ranges) {
  if (!Array.isArray(ranges) || ranges.some((r) => typeof r !== 'string')) throw new Error('[api] 읽을 범위가 올바르지 않습니다.')
  const response = Sheets.Spreadsheets.Values.batchGet(spreadsheet_().getId(), {
    ranges: ranges,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'SERIAL_NUMBER',
    majorDimension: 'ROWS',
  })
  const valueRanges = response.valueRanges || []
  return ranges.map((_, i) => (valueRanges[i] && valueRanges[i].values) || [])
}

/** 탭 이름으로 숫자 sheetId를 찾는다. 없으면 null. */
function getSheetId(sheetName) {
  const sheet = spreadsheet_().getSheetByName(String(sheetName))
  return sheet ? sheet.getSheetId() : null
}

// 앱이 쓰는 요청 종류만 허용한다(행 끼워 넣기, 서식 복사, 셀 값 쓰기). 삭제·탭 변경 등은 거부한다.
const ALLOWED_REQUESTS_ = ['insertRange', 'copyPaste', 'updateCells']

/** spreadsheets.batchUpdate. 요청 전체가 한 번에 적용되거나 전혀 적용되지 않는다. */
function batchUpdate(requests) {
  if (!Array.isArray(requests) || requests.length === 0) throw new Error('[api] 쓸 내용이 없습니다.')
  for (const request of requests) {
    const keys = Object.keys(request || {})
    if (keys.length !== 1 || ALLOWED_REQUESTS_.indexOf(keys[0]) < 0) throw new Error('[access] 허용하지 않는 시트 변경 요청입니다: ' + keys.join(', '))
  }
  // 동시에 들어온 쓰기 요청이 섞이지 않도록 한 번에 하나씩 적용한다.
  const lock = LockService.getDocumentLock()
  if (!lock.tryLock(10000)) throw new Error('[api] 다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.')
  try {
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, spreadsheet_().getId())
  } finally {
    lock.releaseLock()
  }
  return null
}

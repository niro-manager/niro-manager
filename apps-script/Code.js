// Niro Manager — Apps Script 서버 코드.
// 차계부 스프레드시트에 연결된(컨테이너 바인딩) 스크립트로 넣고, 웹 앱으로 배포한다.
// 배포 설정: "다음 사용자 인증 정보로 실행: 나", "액세스 권한: 나만". 안내는 docs/APPS_SCRIPT_SETUP.md.
// 시트 읽기·쓰기는 Sheets 고급 서비스(appsscript.json)로 한다. 앱(index.html)이 만든 batchUpdate 요청을 그대로 적용한다.

/** 웹 앱 첫 화면. index.html은 npm run build로 만든 한 파일짜리 앱이다. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Niro Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // GitHub Pages 런처가 iframe으로 끼워 넣을 수 있게 한다. ALLOWALL은 출처를 고를 수 없어 다른 사이트도 끼워 넣을 수 있다
    // (웹 앱은 소유자만 열 수 있음). 위험과 근거는 CLAUDE.md "런처 끼워 넣기" 참고.
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
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

// 영수증 사진 인식(2026-10-25 합의, A+C). Gemini API(무료 등급)로 값을 바로 읽고, 키가 없거나 실패하면 Drive 글자 인식으로 바꾼다.
// 사진·글자·인식 결과·API 키는 시트·로그에 남기지 않는다. 시트에는 쓰지 않는다.
const OCR_MAX_BASE64_LENGTH_ = 8 * 1024 * 1024
const OCR_MIME_TYPES_ = ['image/jpeg', 'image/png']
const OCR_TEMP_NAME_ = 'Niro Manager 영수증 인식(임시)'
// 스크립트 속성 GEMINI_MODEL로 바꿀 수 있다. 2026-10 기준 안정판 Flash 모델.
const GEMINI_DEFAULT_MODEL_ = 'gemini-3.8-flash'
const GEMINI_PROMPT_ =
  '이 사진은 한국 주유소 영수증이다. 다음 값을 읽어 JSON으로만 답한다. ' +
  'date: 거래 날짜(yyyy-mm-dd). unitPrice: 리터당 단가(원). liters: 주유량(리터, 소수 3자리까지). ' +
  'paid: 실제로 결제(승인)된 금액(원). 공급가·부가세·할인·포인트·적립 금액은 paid가 아니다. ' +
  '보이지 않거나 확실하지 않은 값은 null로 둔다. 카드번호 등 다른 내용은 답하지 않는다.'

/**
 * 영수증 사진을 읽는다. 결과:
 * - Gemini: { engine: 'gemini', fields: { date, unitPrice, liters, paid }, text: '', tempFileLeft: false }
 * - Drive:  { engine: 'drive', text, tempFileLeft, gemini: 'no-key' | 'quota' | 'failed' } (gemini는 Drive로 바꾼 이유)
 */
function ocrReceipt(base64, mimeType) {
  if (typeof base64 !== 'string' || base64.length === 0) throw new Error('[api] 사진이 비어 있습니다.')
  if (base64.length > OCR_MAX_BASE64_LENGTH_) throw new Error('[api] 사진이 너무 큽니다.')
  if (OCR_MIME_TYPES_.indexOf(mimeType) < 0) throw new Error('[api] JPEG·PNG 사진만 읽을 수 있습니다.')
  const properties = PropertiesService.getScriptProperties()
  const apiKey = properties.getProperty('GEMINI_API_KEY')
  let reason = 'no-key'
  if (apiKey) {
    reason = 'failed'
    try {
      const model = properties.getProperty('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL_
      const response = UrlFetchApp.fetch(geminiUrl_(model), {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': apiKey },
        payload: JSON.stringify(geminiRequest_(base64, mimeType, model)),
        muteHttpExceptions: true,
      })
      const code = response.getResponseCode()
      if (code === 200) {
        const fields = parseGeminiResponse_(response.getContentText('UTF-8'))
        if (fields) return { engine: 'gemini', fields: fields, text: '', tempFileLeft: false }
      } else if (code === 429) {
        reason = 'quota'
      }
      // 오류 본문은 버린다(키나 사진 내용이 섞일 수 있는 곳에 남기지 않는다).
    } catch (e) {
      // 연결 실패·시간 초과 등도 Drive로 바꾼다. 오류 내용은 남기지 않는다.
    }
  }
  const drive = ocrWithDrive_(base64, mimeType)
  return { engine: 'drive', text: drive.text, tempFileLeft: drive.tempFileLeft, gemini: reason }
}

function geminiUrl_(model) {
  if (!/^[A-Za-z0-9.-]+$/.test(model)) throw new Error('[api] GEMINI_MODEL 값이 올바르지 않습니다.')
  return 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent'
}

/** Gemini generateContent 요청 본문. 구조화된 JSON 출력(responseSchema)으로 네 값만 받는다 */
function geminiRequest_(base64, mimeType, model) {
  const nullableNumber = { type: 'NUMBER', nullable: true }
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', nullable: true, description: 'yyyy-mm-dd' },
        unitPrice: nullableNumber,
        liters: nullableNumber,
        paid: nullableNumber,
      },
      required: ['date', 'unitPrice', 'liters', 'paid'],
    },
  }
  // Gemini 3 계열은 temperature를 기본값으로 두라는 Google 안내가 있어(낮추면 반복 등) 그 이전 모델에만 0을 쓴다.
  if (!/^gemini-[3-9]/.test(model)) generationConfig.temperature = 0
  return {
    contents: [{ role: 'user', parts: [{ text: GEMINI_PROMPT_ }, { inlineData: { mimeType: mimeType, data: base64 } }] }],
    generationConfig: generationConfig,
  }
}

/** Gemini 응답에서 { date, unitPrice, liters, paid }를 꺼낸다. 형식이 맞지 않으면 null */
function parseGeminiResponse_(body) {
  let json
  try {
    json = JSON.parse(body)
  } catch (e) {
    return null
  }
  const parts = (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || []
  const text = parts
    .map(function (p) {
      return typeof p.text === 'string' && !p.thought ? p.text : ''
    })
    .join('')
  let fields
  try {
    fields = JSON.parse(text)
  } catch (e) {
    return null
  }
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null
  const number = function (v) {
    return typeof v === 'number' && isFinite(v) ? v : null
  }
  return {
    date: typeof fields.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.date) ? fields.date : null,
    unitPrice: number(fields.unitPrice),
    liters: number(fields.liters),
    paid: number(fields.paid),
  }
}

/**
 * Drive 글자 인식. 사진을 잠깐 Google 문서로 변환해 글자만 꺼내고 그 문서는 바로 영구 삭제한다.
 * 결과 { text, tempFileLeft }. tempFileLeft가 true면 임시 문서를 지우지 못한 것이므로 앱이 사용자에게 Drive에서 지우도록 안내한다.
 */
function ocrWithDrive_(base64, mimeType) {
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, 'receipt')
  let fileId = null
  let text = null
  let failure = null
  try {
    // Drive API v3: 사진을 Google 문서 형식으로 올리면 OCR로 변환된다.
    const file = Drive.Files.create({ name: OCR_TEMP_NAME_, mimeType: 'application/vnd.google-apps.document' }, blob, {
      ocrLanguage: 'ko',
      fields: 'id',
    })
    fileId = file.id
    const response = UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '/export?mimeType=text%2Fplain',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true },
    )
    if (response.getResponseCode() !== 200) throw new Error('[api] 영수증 글자를 꺼내지 못했습니다. (HTTP ' + response.getResponseCode() + ')')
    text = response.getContentText('UTF-8')
  } catch (e) {
    failure = e
  } finally {
    // 휴지통을 거치지 않고 영구 삭제한다(files.delete). 실패해도 결과와 함께 알린다.
    if (fileId) {
      try {
        Drive.Files.remove(fileId)
        fileId = null
      } catch (e) {
        // 지우지 못한 임시 문서는 tempFileLeft로 알린다.
      }
    }
  }
  if (failure) {
    const message = String((failure && failure.message) || failure)
    const tagged = /^\[\w+\] /.test(message) ? message : '[api] 영수증 글자 인식이 실패했습니다. (' + message + ')'
    throw new Error(fileId ? tagged + ' Drive에 남은 "' + OCR_TEMP_NAME_ + '" 문서를 지워 주세요.' : tagged)
  }
  return { text: text, tempFileLeft: fileId !== null }
}

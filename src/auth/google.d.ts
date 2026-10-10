// 이 앱이 쓰는 Google Identity Services, gapi, Picker API의 최소 타입 선언.

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token?: string
    expires_in?: number | string
    scope?: string
    error?: string
    error_description?: string
  }
  interface ClientConfigError {
    type: string
    message?: string
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string }): void
  }
  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: ClientConfigError) => void
  }): TokenClient
  function revoke(token: string, done?: () => void): void
}

declare namespace google.picker {
  interface PickerDocument {
    id: string
    name?: string
  }
  interface ResponseObject {
    action: string
    docs?: PickerDocument[]
  }
  class DocsView {
    constructor(viewId?: string)
    setMode(mode: string): DocsView
    setMimeTypes(mimeTypes: string): DocsView
  }
  class PickerBuilder {
    addView(view: DocsView): PickerBuilder
    setOAuthToken(token: string): PickerBuilder
    setDeveloperKey(key: string): PickerBuilder
    setAppId(appId: string): PickerBuilder
    setLocale(locale: string): PickerBuilder
    setTitle(title: string): PickerBuilder
    setCallback(callback: (data: ResponseObject) => void): PickerBuilder
    build(): { setVisible(visible: boolean): void }
  }
  const ViewId: { SPREADSHEETS: string }
  const DocsViewMode: { LIST: string }
  const Action: { PICKED: string; CANCEL: string }
}

declare namespace gapi {
  function load(api: string, callback: { callback: () => void; onerror: () => void }): void
}

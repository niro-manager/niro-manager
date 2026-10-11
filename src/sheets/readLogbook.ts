import { FUEL_FIRST_ROW, parseFuelRows } from '../domain/fuel'
import { MAINTENANCE_FIRST_ROW, parseMaintenanceRows } from '../domain/maintenance'
import type { FuelRecord, MaintenanceRecord, RowWarning } from '../domain/types'
import { quoteSheetName, type SheetConnection } from './sheetsClient'

export interface Logbook {
  fuel: FuelRecord[]
  maintenance: MaintenanceRecord[]
  fuelWarnings: RowWarning[]
  maintenanceWarnings: RowWarning[]
  loadedAt: Date
}

/** 주유·정비 탭을 한 번의 요청으로 읽어 도메인 기록으로 바꾼다. 읽기만 한다. */
export async function readLogbook(source: SheetConnection): Promise<Logbook> {
  const ranges = [
    `${quoteSheetName(source.fuelSheetName)}!A${FUEL_FIRST_ROW}:I`,
    `${quoteSheetName(source.maintenanceSheetName)}!A${MAINTENANCE_FIRST_ROW}:E`,
  ]
  const [fuelRows = [], maintenanceRows = []] = await source.backend.batchGetValues(ranges)
  const fuel = parseFuelRows(fuelRows)
  const maintenance = parseMaintenanceRows(maintenanceRows)
  return {
    fuel: fuel.records,
    maintenance: maintenance.records,
    fuelWarnings: fuel.warnings,
    maintenanceWarnings: maintenance.warnings,
    loadedAt: new Date(),
  }
}

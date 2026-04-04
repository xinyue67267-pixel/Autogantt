/**
 * 极简 OOXML xlsx 构建器。
 *
 * @description
 * SheetJS 社区版（0.18.5）不支持 DataValidation 输出。
 * 本模块使用手动拼接 OOXML XML + 无压缩 ZIP 打包方式，
 * 生成支持列下拉验证的 .xlsx 文件。
 *
 * 同时提供 buildGanttXlsxBlob，用于生成带单元格背景色的甘特矩阵 xlsx 文件。
 * 以及 buildRequirementScheduleXlsxBlob，用于生成需求排期明细 xlsx 文件。
 *
 * 限制：仅支持字符串/数字单元格、单工作表、列级下拉验证，
 * 满足范式模板导出需求。
 */
import type { Requirement, RequirementSchedule } from '../types'

/** 单元格值类型 */
type CellValue = string | number | null

/** 下拉验证配置 */
export interface DropdownValidation {
  /** Excel 列地址范围，如 "F2:F10000" */
  sqref: string
  /** 下拉选项数组 */
  options: string[]
}

/** 将数字列索引（0-based）转换为 Excel 列字母（A, B, ... Z, AA, ...） */
function colLetter(index: number): string {
  let result = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

/** XML 特殊字符转义 */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 根据行列数据生成 sheet1.xml 内容。
 *
 * @param {CellValue[][]} rows 行列数据，第一行为表头
 * @param {DropdownValidation[]} dropdowns 列下拉验证配置
 * @returns {string} sheet1.xml 字符串
 */
function buildSheetXml(rows: CellValue[][], dropdowns: DropdownValidation[]): string {
  const sheetDataRows = rows
    .map((row, rIdx) => {
      const cells = row
        .map((cell, cIdx) => {
          const addr = `${colLetter(cIdx)}${rIdx + 1}`
          if (cell === null || cell === undefined || cell === '') return ''
          if (typeof cell === 'number') {
            return `<c r="${addr}"><v>${cell}</v></c>`
          }
          return `<c r="${addr}" t="inlineStr"><is><t>${escXml(String(cell))}</t></is></c>`
        })
        .join('')
      return `<row r="${rIdx + 1}">${cells}</row>`
    })
    .join('')

  const dvXml =
    dropdowns.length > 0
      ? [
          `<dataValidations count="${dropdowns.length}">`,
          ...dropdowns.map(
            (dv) =>
              `<dataValidation type="list" allowBlank="1" showDropDown="0" sqref="${dv.sqref}">` +
              `<formula1>"${dv.options.map(escXml).join(',')}"</formula1>` +
              `</dataValidation>`,
          ),
          `</dataValidations>`,
        ].join('')
      : ''

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetDataRows}</sheetData>` +
    dvXml +
    `</worksheet>`
  )
}

/** 固定 OOXML 文件内容 */
const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="范式模板" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`

/** 将字符串编码为 UTF-8 字节数组 */
function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

/** 计算 CRC-32 校验值（ZIP 规范要求）。 */
function crc32(data: Uint8Array): number {
  /** CRC-32 查找表 */
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * 写入 32 位小端整数到 DataView。
 *
 * @param {DataView} view 目标视图
 * @param {number} offset 偏移量
 * @param {number} value 值
 */
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true)
}

/**
 * 写入 16 位小端整数到 DataView。
 *
 * @param {DataView} view 目标视图
 * @param {number} offset 偏移量
 * @param {number} value 值
 */
function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true)
}

/**
 * 构建一个无压缩 ZIP 条目（Local File Header + 数据）。
 *
 * @param {string} name 文件路径（ZIP 内）
 * @param {Uint8Array} data 文件内容
 * @returns {{ header: Uint8Array; data: Uint8Array; cdEntry: Uint8Array; localOffset: number }}
 */
function buildZipEntry(
  name: string,
  data: Uint8Array,
  localOffset: number,
): { local: Uint8Array; cd: Uint8Array } {
  const nameBytes = encode(name)
  const crc = crc32(data)
  const size = data.length

  /** Local File Header (30 bytes + filename) */
  const local = new Uint8Array(30 + nameBytes.length + size)
  const lv = new DataView(local.buffer)
  writeU32(lv, 0, 0x04034b50) // signature
  writeU16(lv, 4, 20) // version needed
  writeU16(lv, 6, 0) // flags
  writeU16(lv, 8, 0) // compression: stored
  writeU16(lv, 10, 0) // mod time
  writeU16(lv, 12, 0) // mod date
  writeU32(lv, 14, crc) // CRC-32
  writeU32(lv, 18, size) // compressed size
  writeU32(lv, 22, size) // uncompressed size
  writeU16(lv, 26, nameBytes.length) // filename length
  writeU16(lv, 28, 0) // extra field length
  local.set(nameBytes, 30)
  local.set(data, 30 + nameBytes.length)

  /** Central Directory Entry (46 bytes + filename) */
  const cd = new Uint8Array(46 + nameBytes.length)
  const cv = new DataView(cd.buffer)
  writeU32(cv, 0, 0x02014b50) // signature
  writeU16(cv, 4, 20) // version made by
  writeU16(cv, 6, 20) // version needed
  writeU16(cv, 8, 0) // flags
  writeU16(cv, 10, 0) // compression: stored
  writeU16(cv, 12, 0) // mod time
  writeU16(cv, 14, 0) // mod date
  writeU32(cv, 16, crc) // CRC-32
  writeU32(cv, 20, size) // compressed size
  writeU32(cv, 24, size) // uncompressed size
  writeU16(cv, 28, nameBytes.length) // filename length
  writeU16(cv, 30, 0) // extra field length
  writeU16(cv, 32, 0) // comment length
  writeU16(cv, 34, 0) // disk number start
  writeU16(cv, 36, 0) // internal attributes
  writeU32(cv, 38, 0) // external attributes
  writeU32(cv, 42, localOffset) // relative offset of local header
  cd.set(nameBytes, 46)

  return { local, cd }
}

/**
 * 生成包含列下拉验证的 xlsx 文件 Blob。
 *
 * @param {CellValue[][]} rows 行列数据
 * @param {DropdownValidation[]} dropdowns 列下拉验证配置
 * @returns {Blob} xlsx 文件 Blob
 */
export function buildXlsxBlob(rows: CellValue[][], dropdowns: DropdownValidation[]): Blob {
  const sheetXml = buildSheetXml(rows, dropdowns)

  /** ZIP 条目列表（路径 → 内容） */
  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: encode(RELS_XML) },
    { name: 'xl/workbook.xml', data: encode(WORKBOOK_XML) },
    { name: 'xl/_rels/workbook.xml.rels', data: encode(WORKBOOK_RELS_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encode(sheetXml) },
  ]

  /** 构建所有 local file headers + 数据，记录 CD 条目 */
  const locals: Uint8Array[] = []
  const cds: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const { local, cd } = buildZipEntry(entry.name, entry.data, localOffset)
    locals.push(local)
    cds.push(cd)
    localOffset += local.length
  }

  /** End of Central Directory Record (22 bytes) */
  const cdStart = localOffset
  const cdSize = cds.reduce((acc, cd) => acc + cd.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  writeU32(ev, 0, 0x06054b50) // signature
  writeU16(ev, 4, 0) // disk number
  writeU16(ev, 6, 0) // disk with CD start
  writeU16(ev, 8, entries.length) // entries on disk
  writeU16(ev, 10, entries.length) // total entries
  writeU32(ev, 12, cdSize) // CD size
  writeU32(ev, 16, cdStart) // CD offset
  writeU16(ev, 20, 0) // comment length

  const parts = [...locals, ...cds, eocd]
  const totalSize = parts.reduce((acc, p) => acc + p.length, 0)
  const result = new Uint8Array(totalSize)
  let pos = 0
  for (const part of parts) {
    result.set(part, pos)
    pos += part.length
  }

  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 单元格描述（用于甘特矩阵导出）。
 *
 * @property {string} text 单元格文字（空字符串代表无文字）
 * @property {string | null} bgColor 背景色（CSS hex，如 "#C4B5FD"；null 代表无填充）
 * @property {'header' | 'pipeline' | 'requirement' | 'stage'} [styleKey] 行类型样式键；
 *   header/pipeline: 22pt 加粗居中；requirement: 20pt 加粗居中 + 上边框；stage: 18pt 居中不加粗
 */
export interface GanttCell {
  text: string
  bgColor: string | null
  styleKey?: 'header' | 'pipeline' | 'requirement' | 'stage'
}

/**
 * 将 CSS hex 颜色（如 "#C4B5FD"）转换为 OOXML ARGB 格式（如 "FFC4B5FD"）。
 *
 * @param {string} cssHex CSS hex 颜色字符串
 * @returns {string} ARGB 格式字符串
 */
function toArgb(cssHex: string): string {
  const hex = cssHex.replace('#', '')
  // 补全 3 位简写
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  return `FF${full.toUpperCase()}`
}

/**
 * 构建 styles.xml，收集所有用到的背景色，生成对应 xf 样式索引。
 *
 * xf 索引分配：
 *   0             = 默认样式（无填充，无特殊格式）
 *   1 .. N        = 背景色填充样式（颜色顺序与 uniqueColors 一致）
 *   N+1           = header/pipeline 行（22pt 加粗居中，无填充）
 *   N+2           = requirement 行（20pt 加粗居中，无填充）
 *   N+3           = requirement 行带上边框（20pt 加粗居中，topBorder 加粗）
 *   N+4           = stage 行（18pt 不加粗居中，无填充）
 *
 * @param {string[]} uniqueColors 去重后的 CSS hex 颜色列表（不含 null）
 * @returns {{ xml: string; colorIndexMap: Map<string, number>; styleKeyBase: number }}
 *   xml: styles.xml 内容；colorIndexMap: cssHex → xf 索引；styleKeyBase: 行样式起始索引（=N+1）
 */
function buildStylesXml(uniqueColors: string[]): {
  xml: string
  colorIndexMap: Map<string, number>
  styleKeyBase: number
} {
  const colorIndexMap = new Map<string, number>()
  uniqueColors.forEach((color, i) => {
    colorIndexMap.set(color, i + 1)
  })
  const styleKeyBase = uniqueColors.length + 1

  // fills: fill 0 = none（规范要求）, fill 1 = gray125（规范要求）, fill 2..N+1 = 自定义颜色
  const fillsXml = [
    `<fill><patternFill patternType="none"/></fill>`,
    `<fill><patternFill patternType="gray125"/></fill>`,
    ...uniqueColors.map(
      (color) =>
        `<fill><patternFill patternType="solid">` +
        `<fgColor rgb="${toArgb(color)}"/>` +
        `<bgColor indexed="64"/>` +
        `</patternFill></fill>`,
    ),
  ].join('')

  // fonts: 0=默认11pt, 1=22pt加粗, 2=20pt加粗, 3=18pt不加粗
  const fontsXml = [
    `<font><sz val="11"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="22"/><name val="Calibri"/></font>`,
    `<font><b/><sz val="20"/><name val="Calibri"/></font>`,
    `<font><sz val="18"/><name val="Calibri"/></font>`,
  ].join('')

  // borders: 0=空边框（规范要求）, 1=上边框加粗（需求行顶部分隔线）
  const bordersXml = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,
    `<border><left/><right/><top style="medium"/><bottom/><diagonal/></border>`,
  ].join('')

  // cellStyleXfs: 至少一个默认 xf（规范要求）
  const cellStyleXfsXml = `<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>`

  // alignment 居中属性片段
  const centerAlign = `<alignment horizontal="center"/>`

  // cellXfs:
  //   0         = 默认（无填充无格式）
  //   1..N      = 背景色填充（fillId=2+i）
  //   N+1       = header/pipeline（font1=22pt加粗，居中）
  //   N+2       = requirement（font2=20pt加粗，居中）
  //   N+3       = requirement + 上边框（font2=20pt加粗，居中，border1）
  //   N+4       = stage（font3=18pt，居中）
  const cellXfsXml = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    ...uniqueColors.map(
      (_, i) =>
        `<xf numFmtId="0" fontId="0" fillId="${i + 2}" borderId="0" xfId="0" applyFill="1"/>`,
    ),
    // N+1: header/pipeline
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${centerAlign}</xf>`,
    // N+2: requirement
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${centerAlign}</xf>`,
    // N+3: requirement + topBorder
    `<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">${centerAlign}</xf>`,
    // N+4: stage
    `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${centerAlign}</xf>`,
  ].join('')

  const totalXfs = uniqueColors.length + 5

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="4">${fontsXml}</fonts>` +
    `<fills count="${uniqueColors.length + 2}">${fillsXml}</fills>` +
    `<borders count="2">${bordersXml}</borders>` +
    `<cellStyleXfs count="1">${cellStyleXfsXml}</cellStyleXfs>` +
    `<cellXfs count="${totalXfs}">${cellXfsXml}</cellXfs>` +
    `</styleSheet>`

  return { xml, colorIndexMap, styleKeyBase }
}

/**
 * 构建带背景色的甘特矩阵 sheet1.xml。
 *
 * @param {GanttCell[][]} rows 行列数据
 * @param {Map<string, number>} colorIndexMap cssHex → xf 样式索引
 * @param {number} styleKeyBase 行类型样式的起始 xf 索引（header/pipeline=base, req=base+1, req+border=base+2, stage=base+3）
 * @returns {string} sheet1.xml 内容
 */
function buildGanttSheetXml(
  rows: GanttCell[][],
  colorIndexMap: Map<string, number>,
  styleKeyBase: number,
): string {
  /**
   * 将 styleKey 映射到 xf 索引偏移。
   * header/pipeline → styleKeyBase+0（22pt 加粗居中）
   * requirement     → styleKeyBase+1（20pt 加粗居中）或 styleKeyBase+2（含上边框）
   * stage           → styleKeyBase+3（18pt 居中）
   *
   * 需求行（requirement）首次出现时加上边框（每个需求块顶部），
   * 通过检测同行第一列 styleKey==='requirement' 来判断是否加边框。
   */
  const sheetDataRows = rows
    .map((row, rIdx) => {
      // 取该行第一个单元格的 styleKey 决定是否需要上边框
      const rowStyleKey = row[0]?.styleKey
      const useTopBorder = rowStyleKey === 'requirement'

      const cells = row
        .map((cell, cIdx) => {
          const addr = `${colLetter(cIdx)}${rIdx + 1}`

          // 确定样式索引：背景色优先，其次行类型样式
          let styleIdx = cell.bgColor ? (colorIndexMap.get(cell.bgColor) ?? 0) : 0
          if (styleIdx === 0 && cell.styleKey) {
            switch (cell.styleKey) {
              case 'header':
              case 'pipeline':
                styleIdx = styleKeyBase
                break
              case 'requirement':
                styleIdx = useTopBorder ? styleKeyBase + 2 : styleKeyBase + 1
                break
              case 'stage':
                styleIdx = styleKeyBase + 3
                break
            }
          }

          const sAttr = styleIdx > 0 ? ` s="${styleIdx}"` : ''
          if (!cell.text) {
            return styleIdx > 0 ? `<c r="${addr}"${sAttr}/>` : ''
          }
          return `<c r="${addr}" t="inlineStr"${sAttr}><is><t>${escXml(cell.text)}</t></is></c>`
        })
        .join('')
      return `<row r="${rIdx + 1}">${cells}</row>`
    })
    .join('')

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetDataRows}</sheetData>` +
    `</worksheet>`
  )
}

/**
 * 生成带单元格背景色的甘特矩阵 xlsx 文件 Blob。
 *
 * @param {GanttCell[][]} rows 行列数据（第一行为表头，第一列为层级名称）
 * @param {string} sheetName 工作表名称
 * @returns {Blob} xlsx 文件 Blob
 */
export function buildGanttXlsxBlob(rows: GanttCell[][], sheetName: string): Blob {
  // 收集所有唯一背景色
  const colorSet = new Set<string>()
  for (const row of rows) {
    for (const cell of row) {
      if (cell.bgColor) colorSet.add(cell.bgColor)
    }
  }
  const uniqueColors = Array.from(colorSet)

  const { xml: stylesXml, colorIndexMap, styleKeyBase } = buildStylesXml(uniqueColors)
  const sheetXml = buildGanttSheetXml(rows, colorIndexMap, styleKeyBase)

  const CONTENT_TYPES_WITH_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  const WORKBOOK_RELS_WITH_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`

  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: encode(CONTENT_TYPES_WITH_STYLES) },
    { name: '_rels/.rels', data: encode(RELS_XML) },
    { name: 'xl/workbook.xml', data: encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encode(WORKBOOK_RELS_WITH_STYLES) },
    { name: 'xl/worksheets/sheet1.xml', data: encode(sheetXml) },
    { name: 'xl/styles.xml', data: encode(stylesXml) },
  ]

  const locals: Uint8Array[] = []
  const cds: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const { local, cd } = buildZipEntry(entry.name, entry.data, localOffset)
    locals.push(local)
    cds.push(cd)
    localOffset += local.length
  }

  const cdStart = localOffset
  const cdSize = cds.reduce((acc, cd) => acc + cd.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  writeU32(ev, 0, 0x06054b50)
  writeU16(ev, 4, 0)
  writeU16(ev, 6, 0)
  writeU16(ev, 8, entries.length)
  writeU16(ev, 10, entries.length)
  writeU32(ev, 12, cdSize)
  writeU32(ev, 16, cdStart)
  writeU16(ev, 20, 0)

  const parts = [...locals, ...cds, eocd]
  const totalSize = parts.reduce((acc, p) => acc + p.length, 0)
  const result = new Uint8Array(totalSize)
  let pos = 0
  for (const part of parts) {
    result.set(part, pos)
    pos += part.length
  }

  return new Blob([result], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 生成需求排期明细 xlsx 文件 Blob。
 *
 * @description
 * 按需求 → 环节两级行结构生成 5 列固定表格：
 *   A=需求/环节、B=需求级别、C=开始日期、D=结束日期、E=排期区间
 * 表头行与需求行加粗（font 14pt bold），环节行正常字重（font 11pt）。
 *
 * @param {Requirement[]} requirements 当前筛选后的需求列表
 * @param {RequirementSchedule[]} schedules 对应排期列表
 * @returns {Blob} xlsx 文件 Blob
 */
export function buildRequirementScheduleXlsxBlob(
  requirements: Requirement[],
  schedules: RequirementSchedule[],
): Blob {
  const scheduleMap = new Map(schedules.map((s) => [s.requirementId, s]))

  /**
   * 构建行数据：表头行 + 每条需求行 + 各环节行。
   * 需求行：A=名称，B=级别，C/D/E 留空。
   * 环节行：A=两空格缩进名称，B 留空，C=开始日期，D=结束日期，E=区间字符串。
   */
  const headerRow: CellValue[] = ['需求/环节', '需求级别', '开始日期', '结束日期', '排期']
  const dataRows: CellValue[][] = []

  /** 记录每条数据行是否为需求行（用于样式判断，与 dataRows 一一对应） */
  const isReqRowFlags: boolean[] = []

  for (const req of requirements) {
    dataRows.push([req.requirementName, req.levelId, null, null, null])
    isReqRowFlags.push(true)

    const schedule = scheduleMap.get(req.id)
    if (schedule) {
      for (const stage of schedule.stages) {
        const range = `${stage.startDate} - ${stage.endDate}`
        dataRows.push([`  ${stage.stageName}`, null, stage.startDate, stage.endDate, range])
        isReqRowFlags.push(false)
      }
    }
  }

  const allRows = [headerRow, ...dataRows]

  /**
   * styles.xml：两种字体样式。
   * xf 0: 默认 11pt（环节行）
   * xf 1: 14pt 加粗（表头行 + 需求行）
   */
  const reqStylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="2">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `</fills>` +
    `<borders count="1">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs>` +
    `</styleSheet>`

  /**
   * 循环目的：逐行生成 sheetData XML，表头行和需求行使用加粗样式（s="1"）。
   */
  const sheetDataRows = allRows
    .map((row, rIdx) => {
      /** rIdx=0 为表头行，rIdx>0 时查 isReqRowFlags[rIdx-1] 判断需求行 */
      const useBold = rIdx === 0 || isReqRowFlags[rIdx - 1] === true
      const sAttr = useBold ? ` s="1"` : ''
      const cells = row
        .map((cell, cIdx) => {
          const addr = `${colLetter(cIdx)}${rIdx + 1}`
          if (cell === null || cell === undefined || cell === '') {
            return useBold ? `<c r="${addr}"${sAttr}/>` : ''
          }
          return `<c r="${addr}" t="inlineStr"${sAttr}><is><t>${escXml(String(cell))}</t></is></c>`
        })
        .join('')
      return `<row r="${rIdx + 1}">${cells}</row>`
    })
    .join('')

  const reqSheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetDataRows}</sheetData>` +
    `</worksheet>`

  const REQ_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

  const REQ_WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

  const reqWorkbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="需求排期" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`

  const reqEntries: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: encode(REQ_CONTENT_TYPES) },
    { name: '_rels/.rels', data: encode(RELS_XML) },
    { name: 'xl/workbook.xml', data: encode(reqWorkbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encode(REQ_WORKBOOK_RELS) },
    { name: 'xl/worksheets/sheet1.xml', data: encode(reqSheetXml) },
    { name: 'xl/styles.xml', data: encode(reqStylesXml) },
  ]

  const reqLocals: Uint8Array[] = []
  const reqCds: Uint8Array[] = []
  let reqLocalOffset = 0

  for (const entry of reqEntries) {
    const { local, cd } = buildZipEntry(entry.name, entry.data, reqLocalOffset)
    reqLocals.push(local)
    reqCds.push(cd)
    reqLocalOffset += local.length
  }

  const reqCdStart = reqLocalOffset
  const reqCdSize = reqCds.reduce((acc, cd) => acc + cd.length, 0)
  const reqEocd = new Uint8Array(22)
  const reqEv = new DataView(reqEocd.buffer)
  writeU32(reqEv, 0, 0x06054b50)
  writeU16(reqEv, 4, 0)
  writeU16(reqEv, 6, 0)
  writeU16(reqEv, 8, reqEntries.length)
  writeU16(reqEv, 10, reqEntries.length)
  writeU32(reqEv, 12, reqCdSize)
  writeU32(reqEv, 16, reqCdStart)
  writeU16(reqEv, 20, 0)

  const reqParts = [...reqLocals, ...reqCds, reqEocd]
  const reqTotalSize = reqParts.reduce((acc, p) => acc + p.length, 0)
  const reqResult = new Uint8Array(reqTotalSize)
  let reqPos = 0
  for (const part of reqParts) {
    reqResult.set(part, reqPos)
    reqPos += part.length
  }

  return new Blob([reqResult], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

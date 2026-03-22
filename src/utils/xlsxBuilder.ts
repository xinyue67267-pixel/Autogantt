/**
 * 极简 OOXML xlsx 构建器。
 *
 * @description
 * SheetJS 社区版（0.18.5）不支持 DataValidation 输出。
 * 本模块使用手动拼接 OOXML XML + 无压缩 ZIP 打包方式，
 * 生成支持列下拉验证的 .xlsx 文件。
 *
 * 限制：仅支持字符串/数字单元格、单工作表、列级下拉验证，
 * 满足范式模板导出需求。
 */

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

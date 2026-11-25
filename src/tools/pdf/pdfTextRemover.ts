import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib'

export interface TextSuppression {
  id: string
  originalPageIndex: number
  /** Baseline start X in raw PDF user space */
  pdfX: number
  /** Baseline end X in raw PDF user space */
  pdfMaxX: number
  /** Baseline Y in raw PDF user space */
  pdfY: number
  /** Approximate font size in PDF points */
  pdfFontSize: number
}

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function mulMat(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ]
}

interface Token {
  kind: 'op' | 'num' | 'str' | 'hex' | 'name' | 'array' | 'dict' | 'inline-img'
  raw: string
  num?: number
  start: number
  end: number
}

function isWs(ch: string) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\0'
}

function isDelim(ch: string) {
  return (
    isWs(ch) ||
    ch === '(' ||
    ch === ')' ||
    ch === '<' ||
    ch === '>' ||
    ch === '[' ||
    ch === ']' ||
    ch === '{' ||
    ch === '}' ||
    ch === '/' ||
    ch === '%'
  )
}

function tokenizeContentStream(src: string): Token[] {
  const tokens: Token[] = []
  const len = src.length
  let i = 0

  while (i < len) {
    const ch = src[i]!
    if (isWs(ch)) {
      i++
      continue
    }
    if (ch === '%') {
      while (i < len && src[i] !== '\n' && src[i] !== '\r') i++
      continue
    }
    if (ch === '(') {
      const start = i
      i++
      let depth = 1
      while (i < len && depth > 0) {
        const c = src[i]!
        if (c === '\\') {
          i += 2
          continue
        }
        if (c === '(') depth++
        else if (c === ')') depth--
        i++
      }
      tokens.push({ kind: 'str', raw: src.slice(start, i), start, end: i })
      continue
    }
    if (ch === '<') {
      const start = i
      if (src[i + 1] === '<') {
        i += 2
        let depth = 1
        while (i < len && depth > 0) {
          if (src[i] === '<' && src[i + 1] === '<') {
            depth++
            i += 2
          } else if (src[i] === '>' && src[i + 1] === '>') {
            depth--
            i += 2
          } else if (src[i] === '(') {
            i++
            let sd = 1
            while (i < len && sd > 0) {
              if (src[i] === '\\') i += 2
              else {
                if (src[i] === '(') sd++
                else if (src[i] === ')') sd--
                i++
              }
            }
          } else {
            i++
          }
        }
        tokens.push({ kind: 'dict', raw: src.slice(start, i), start, end: i })
      } else {
        i++
        while (i < len && src[i] !== '>') i++
        if (i < len) i++
        tokens.push({ kind: 'hex', raw: src.slice(start, i), start, end: i })
      }
      continue
    }
    if (ch === '[') {
      const start = i
      i++
      let depth = 1
      while (i < len && depth > 0) {
        const c = src[i]!
        if (c === '(') {
          i++
          let sd = 1
          while (i < len && sd > 0) {
            if (src[i] === '\\') i += 2
            else {
              if (src[i] === '(') sd++
              else if (src[i] === ')') sd--
              i++
            }
          }
        } else if (c === '<' && src[i + 1] !== '<') {
          i++
          while (i < len && src[i] !== '>') i++
          if (i < len) i++
        } else if (c === '[') {
          depth++
          i++
        } else if (c === ']') {
          depth--
          i++
        } else {
          i++
        }
      }
      tokens.push({ kind: 'array', raw: src.slice(start, i), start, end: i })
      continue
    }
    if (ch === '/') {
      const start = i
      i++
      while (i < len && !isDelim(src[i]!)) i++
      tokens.push({ kind: 'name', raw: src.slice(start, i), start, end: i })
      continue
    }

    const start = i
    while (i < len && !isDelim(src[i]!)) i++
    if (i === start) {
      i++
      continue
    }
    const raw = src.slice(start, i)

    if (raw === 'BI') {
      // Skip inline image until EI
      while (i < len) {
        if (isWs(src[i]!) && src.slice(i + 1, i + 3) === 'EI' && (i + 3 >= len || isDelim(src[i + 3]!))) {
          i += 3
          break
        }
        i++
      }
      tokens.push({ kind: 'inline-img', raw: src.slice(start, i), start, end: i })
      continue
    }

    const asNum = Number(raw)
    if (raw !== '' && !Number.isNaN(asNum) && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw)) {
      tokens.push({ kind: 'num', raw, num: asNum, start, end: i })
    } else {
      tokens.push({ kind: 'op', raw, start, end: i })
    }
  }

  return tokens
}

function decodeStreamLatin1(stream: PDFRawStream): string {
  const bytes = decodePDFRawStream(stream).decode()
  let out = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return out
}

function encodeLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff
  }
  return bytes
}

function processContentString(params: {
  src: string
  initialCtm: Matrix
  targets: TextSuppression[]
  matchedIds: Set<string>
  resources?: PDFDict
  doc: PDFDocument
  visitedXObjects: Set<string>
}): { output: string; changed: boolean } {
  const { src, initialCtm, targets, matchedIds, resources, doc, visitedXObjects } = params
  const tokens = tokenizeContentStream(src)
  const replacements: { start: number; end: number; text: string }[] = []

  let ctm: Matrix = [...initialCtm]
  const ctmStack: Matrix[] = []
  let tm: Matrix = [...IDENTITY]
  let tlm: Matrix = [...IDENTITY]
  let tl = 0
  let inText = false
  const operands: Token[] = []

  const numAt = (idxFromEnd: number): number => {
    const t = operands[operands.length - idxFromEnd]
    return t?.num ?? 0
  }

  const checkMatch = (eff: Matrix): TextSuppression | undefined => {
    const px = eff[4]
    const py = eff[5]
    return targets.find((t) => {
      const tolY = Math.max(4, t.pdfFontSize * 0.45)
      const tolX = Math.max(4, t.pdfFontSize * 0.5)
      return (
        Math.abs(py - t.pdfY) <= tolY &&
        px >= t.pdfX - tolX &&
        px <= t.pdfMaxX + tolX
      )
    })
  }

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx]!
    if (tok.kind !== 'op') {
      operands.push(tok)
      continue
    }

    const op = tok.raw
    switch (op) {
      case 'q':
        ctmStack.push([...ctm])
        break
      case 'Q': {
        const prev = ctmStack.pop()
        if (prev) ctm = prev
        break
      }
      case 'cm':
        if (operands.length >= 6) {
          const m: Matrix = [
            numAt(6),
            numAt(5),
            numAt(4),
            numAt(3),
            numAt(2),
            numAt(1),
          ]
          ctm = mulMat(m, ctm)
        }
        break
      case 'BT':
        inText = true
        tm = [...IDENTITY]
        tlm = [...IDENTITY]
        break
      case 'ET':
        inText = false
        break
      case 'Tm':
        if (inText && operands.length >= 6) {
          const m: Matrix = [
            numAt(6),
            numAt(5),
            numAt(4),
            numAt(3),
            numAt(2),
            numAt(1),
          ]
          tm = [...m]
          tlm = [...m]
        }
        break
      case 'Td':
        if (inText && operands.length >= 2) {
          const tx = numAt(2)
          const ty = numAt(1)
          tlm = mulMat([1, 0, 0, 1, tx, ty], tlm)
          tm = [...tlm]
        }
        break
      case 'TD':
        if (inText && operands.length >= 2) {
          const tx = numAt(2)
          const ty = numAt(1)
          tl = -ty
          tlm = mulMat([1, 0, 0, 1, tx, ty], tlm)
          tm = [...tlm]
        }
        break
      case 'TL':
        if (operands.length >= 1) tl = numAt(1)
        break
      case 'T*':
        if (inText) {
          tlm = mulMat([1, 0, 0, 1, 0, -tl], tlm)
          tm = [...tlm]
        }
        break
      case 'Tj':
      case 'TJ': {
        if (inText && operands.length >= 1) {
          const arg = operands[operands.length - 1]!
          const eff = mulMat(tm, ctm)
          const match = checkMatch(eff)
          if (match) {
            matchedIds.add(match.id)
            replacements.push({
              start: arg.start,
              end: tok.end,
              text: op === 'TJ' ? '[()] TJ' : '() Tj',
            })
          }
        }
        break
      }
      case "'": {
        if (inText && operands.length >= 1) {
          const arg = operands[operands.length - 1]!
          tlm = mulMat([1, 0, 0, 1, 0, -tl], tlm)
          tm = [...tlm]
          const eff = mulMat(tm, ctm)
          const match = checkMatch(eff)
          if (match) {
            matchedIds.add(match.id)
            replacements.push({
              start: arg.start,
              end: tok.end,
              text: 'T*',
            })
          }
        }
        break
      }
      case '"': {
        if (inText && operands.length >= 3) {
          const aw = operands[operands.length - 3]!
          tlm = mulMat([1, 0, 0, 1, 0, -tl], tlm)
          tm = [...tlm]
          const eff = mulMat(tm, ctm)
          const match = checkMatch(eff)
          if (match) {
            matchedIds.add(match.id)
            replacements.push({
              start: aw.start,
              end: tok.end,
              text: 'T*',
            })
          }
        }
        break
      }
      case 'Do': {
        if (resources && operands.length >= 1) {
          const nameTok = operands[operands.length - 1]
          if (nameTok?.kind === 'name') {
            const xobjDict = resources.lookup(PDFName.of('XObject'))
            if (xobjDict instanceof PDFDict) {
              const rawName = nameTok.raw.slice(1)
              const refOrStream = xobjDict.get(PDFName.of(rawName))
              const refKey = refOrStream instanceof PDFRef ? refOrStream.toString() : rawName
              const resolved = xobjDict.lookup(PDFName.of(rawName))
              if (resolved instanceof PDFRawStream && !visitedXObjects.has(refKey)) {
                const subtype = resolved.dict.get(PDFName.of('Subtype'))
                if (subtype instanceof PDFName && subtype.decodeText() === 'Form') {
                  visitedXObjects.add(refKey)
                  let formMatrix: Matrix = [...IDENTITY]
                  const mArr = resolved.dict.lookup(PDFName.of('Matrix'))
                  if (mArr instanceof PDFArray && mArr.size() === 6) {
                    formMatrix = [
                      Number(mArr.get(0).toString()) || 1,
                      Number(mArr.get(1).toString()) || 0,
                      Number(mArr.get(2).toString()) || 0,
                      Number(mArr.get(3).toString()) || 1,
                      Number(mArr.get(4).toString()) || 0,
                      Number(mArr.get(5).toString()) || 0,
                    ]
                  }
                  const formRes = resolved.dict.lookup(PDFName.of('Resources'))
                  const formSrc = decodeStreamLatin1(resolved)
                  const formResDict = formRes instanceof PDFDict ? formRes : resources
                  const formOut = processContentString({
                    src: formSrc,
                    initialCtm: mulMat(formMatrix, ctm),
                    targets,
                    matchedIds,
                    resources: formResDict,
                    doc,
                    visitedXObjects,
                  })
                  if (formOut.changed) {
                    const newBytes = encodeLatin1(formOut.output)
                    const newStream = doc.context.flateStream(newBytes)
                    for (const [k, v] of resolved.dict.entries()) {
                      const keyName = k.decodeText()
                      if (keyName !== 'Length' && keyName !== 'Filter' && keyName !== 'DecodeParms') {
                        newStream.dict.set(k, v)
                      }
                    }
                    if (refOrStream instanceof PDFRef) {
                      doc.context.assign(refOrStream, newStream)
                    }
                  }
                }
              }
            }
          }
        }
        break
      }
      default:
        break
    }

    operands.length = 0
  }

  if (replacements.length === 0) {
    return { output: src, changed: false }
  }

  let out = ''
  let cursor = 0
  for (const r of replacements) {
    out += src.slice(cursor, r.start) + r.text
    cursor = r.end
  }
  out += src.slice(cursor)
  return { output: out, changed: true }
}

/**
 * Strips suppressed text operators from the given PDF bytes.
 * Returns updated PDF bytes and the IDs of suppressions that were actually removed from PDF streams.
 */
export async function stripSuppressedTextFromPdf(
  rawBytes: Uint8Array,
  suppressions: TextSuppression[],
): Promise<{ bytes: Uint8Array; matchedIds: Set<string> }> {
  const matchedIds = new Set<string>()
  if (suppressions.length === 0) {
    return { bytes: rawBytes, matchedIds }
  }

  const byPage = new Map<number, TextSuppression[]>()
  for (const s of suppressions) {
    const arr = byPage.get(s.originalPageIndex) ?? []
    arr.push(s)
    byPage.set(s.originalPageIndex, arr)
  }

  const doc = await PDFDocument.load(rawBytes)
  const pdfPages = doc.getPages()
  let anyPageChanged = false

  for (const [pageIdx, targets] of byPage.entries()) {
    const page = pdfPages[pageIdx]
    if (!page) continue
    const contents = page.node.Contents()
    if (!contents) continue

    const res = page.node.Resources()
    const visitedXObjects = new Set<string>()

    const streamRefs: { ref?: PDFRef; stream: PDFRawStream }[] = []
    if (contents instanceof PDFRawStream) {
      const ref = page.node.get(PDFName.of('Contents'))
      streamRefs.push({ ref: ref instanceof PDFRef ? ref : undefined, stream: contents })
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const rawRef = contents.get(i)
        const looked = contents.lookup(i)
        if (looked instanceof PDFRawStream) {
          streamRefs.push({ ref: rawRef instanceof PDFRef ? rawRef : undefined, stream: looked })
        }
      }
    }

    if (streamRefs.length === 0) continue

    // Concatenate multiple page content streams if needed so BT/ET or q/Q across streams stay intact
    const combinedSrc = streamRefs.map((s) => decodeStreamLatin1(s.stream)).join('\n')
    const result = processContentString({
      src: combinedSrc,
      initialCtm: IDENTITY,
      targets,
      matchedIds,
      resources: res,
      doc,
      visitedXObjects,
    })

    if (result.changed) {
      anyPageChanged = true
      const newStream = doc.context.flateStream(encodeLatin1(result.output))
      const newRef = doc.context.register(newStream)
      page.node.set(PDFName.of('Contents'), newRef)
    } else if (matchedIds.size > 0) {
      // Form XObject inside the page was modified
      anyPageChanged = true
    }
  }

  if (!anyPageChanged) {
    return { bytes: rawBytes, matchedIds }
  }

  const saved = await doc.save()
  return { bytes: saved, matchedIds }
}

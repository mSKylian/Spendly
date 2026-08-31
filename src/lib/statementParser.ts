import type { ParsedStatement } from '../types';

// -----------------------------------------------------------------------
// Deterministic, dependency-free client-side bank statement parsers.
//
// Supported formats: CSV (French semicolon and English comma layouts),
// OFX (SGML-ish, tag-scanned), QIF (!Type:Bank, field-tagged records).
//
// Balance fallback convention (documented once, applies to all parsers):
// when a file does not carry an explicit opening/closing balance, we set
// `openingBalance = 0` and derive `closingBalance = sum(transaction amounts)`.
// This is a best-effort approximation for reconciliation purposes only.
// -----------------------------------------------------------------------

export const SUPPORTED_CLIENT_EXTENSIONS = ['.csv', '.ofx', '.qif'] as const;
export type SupportedClientExtension = (typeof SUPPORTED_CLIENT_EXTENSIONS)[number];

const DEFAULT_CURRENCY = 'EUR';

/**
 * Detects the statement format from a filename's extension.
 * Returns null when the extension is not one we can parse client-side
 * (e.g. .pdf / images, which go through the server LLM route instead).
 */
export function detectFormat(filename: string): SupportedClientExtension | null {
  const lower = filename.toLowerCase();
  const match = SUPPORTED_CLIENT_EXTENSIONS.find((ext) => lower.endsWith(ext));
  return match ?? null;
}

/**
 * Parses a bank statement file's raw text content into a ParsedStatement,
 * dispatching on the file extension. Throws if the format is unsupported
 * or the file is empty; individual malformed lines/records are skipped
 * rather than throwing.
 */
export function parseStatementFile(filename: string, content: string): ParsedStatement {
  const format = detectFormat(filename);
  if (!format) {
    throw new Error(`Unsupported statement file type: ${filename}. Supported: ${SUPPORTED_CLIENT_EXTENSIONS.join(', ')}`);
  }
  if (!content || !content.trim()) {
    throw new Error('Statement file is empty.');
  }

  switch (format) {
    case '.csv':
      return parseCSV(content, filename);
    case '.ofx':
      return parseOFX(content, filename);
    case '.qif':
      return parseQIF(content, filename);
  }
}

// -------------------------------------------------------------------------
// Shared helpers
// -------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sumAmounts(transactions: Array<{ amount: number }>): number {
  return round2(transactions.reduce((acc, t) => acc + t.amount, 0));
}

function bankNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Relevé importé';
}

/**
 * Normalizes a date string to ISO 8601 (YYYY-MM-DD).
 * Accepts: YYYY-MM-DD, YYYYMMDD, DD/MM/YYYY, JJ/MM/AAAA, DD-MM-YYYY, MM/DD/YYYY (best-effort).
 * Returns null if the date cannot be parsed.
 */
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO already: YYYY-MM-DD (optionally with time)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // OFX/QIF compact: YYYYMMDD
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // DD/MM/YYYY or DD-MM-YYYY (French convention, default)
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = m[3];
    if (month > 12 && day <= 12) {
      // Looks like MM/DD/YYYY after all
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // QIF short dates: M/D/YY or M/D'YY
  m = s.match(/^(\d{1,2})\/(\d{1,2})['/](\d{2,4})$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = (parseInt(year, 10) < 70 ? '20' : '19') + year;
    return `${year}-${String(parseInt(m[1], 10)).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Parses a numeric amount string that may use comma or dot as decimal
 * separator, and may contain thousands separators (spaces or dots/commas).
 * Returns NaN if unparsable.
 */
function parseAmount(raw: string): number {
  let s = raw.trim();
  if (!s) return NaN;
  s = s.replace(/[€$£\s]/g, '');
  const isNegParen = /^\(.*\)$/.test(s);
  if (isNegParen) s = s.slice(1, -1);

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Comma as decimal separator (French style: -45,20)
    s = s.replace(',', '.');
  }
  let n = parseFloat(s);
  if (isNaN(n)) return NaN;
  if (isNegParen) n = -Math.abs(n);
  return n;
}

// -------------------------------------------------------------------------
// CSV parser
// -------------------------------------------------------------------------

function splitCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        fields.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (Libellé -> Libelle)
    .replace(/[^a-z0-9]/g, '');
}

export function parseCSV(content: string, filename = 'statement.csv'): ParsedStatement {
  // Strip BOM if present.
  const clean = content.replace(/^﻿/, '');
  const lines = clean.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return emptyStatement(filename);
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') && !headerLine.includes(',') ? ';'
    : headerLine.includes(';') && (headerLine.split(';').length >= headerLine.split(',').length) ? ';'
    : ',';

  const rawHeaders = splitCSVLine(headerLine, delimiter);
  const headers = rawHeaders.map(normalizeHeader);

  const idx = (candidates: string[]): number => {
    for (const c of candidates) {
      const i = headers.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };

  const dateIdx = idx(['date', 'datedoperation', 'dateoperation', 'dateval', 'datevaleur', 'transactiondate']);
  const labelIdx = idx(['libelle', 'description', 'label', 'wording', 'libelleoperation', 'communication']);
  const debitIdx = idx(['debit', 'débit']);
  const creditIdx = idx(['credit', 'crédit']);
  const montantIdx = idx(['montant', 'amount']);
  const balanceIdx = idx(['balance', 'solde']);

  const transactions: ParsedStatement['transactions'] = [];

  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const fields = splitCSVLine(line, delimiter);
    if (fields.length < 2) continue;

    const dateRaw = dateIdx !== -1 ? fields[dateIdx] : undefined;
    const label = labelIdx !== -1 ? fields[labelIdx] : (fields.find((_, i) => i !== dateIdx && i !== debitIdx && i !== creditIdx && i !== montantIdx) || '').trim();

    if (!dateRaw) continue;
    const isoDate = normalizeDate(dateRaw);
    if (!isoDate) continue;

    let amount: number | null = null;

    if (montantIdx !== -1 && fields[montantIdx]) {
      const parsed = parseAmount(fields[montantIdx]);
      if (!isNaN(parsed)) amount = parsed;
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debitRaw = debitIdx !== -1 ? fields[debitIdx] : '';
      const creditRaw = creditIdx !== -1 ? fields[creditIdx] : '';
      if (debitRaw && debitRaw.trim()) {
        const d = parseAmount(debitRaw);
        if (!isNaN(d)) amount = -Math.abs(d);
      } else if (creditRaw && creditRaw.trim()) {
        const c = parseAmount(creditRaw);
        if (!isNaN(c)) amount = Math.abs(c);
      }
    }

    if (amount === null || isNaN(amount)) continue;

    transactions.push({
      date: isoDate,
      label: label || 'Transaction',
      amount: round2(amount),
    });
  }

  let closingBalance: number | undefined;
  if (balanceIdx !== -1 && lines.length > 1) {
    const lastFields = splitCSVLine(lines[lines.length - 1], delimiter);
    const parsedBal = balanceIdx < lastFields.length ? parseAmount(lastFields[balanceIdx]) : NaN;
    if (!isNaN(parsedBal)) closingBalance = round2(parsedBal);
  }
  if (closingBalance === undefined) {
    // Fallback: no explicit balance column found, derive from transactions
    // (see module-level comment on the balance fallback convention).
    closingBalance = sumAmounts(transactions);
  }

  return {
    account: {
      name: bankNameFromFilename(filename),
      bankName: bankNameFromFilename(filename),
      currency: DEFAULT_CURRENCY,
      openingBalance: 0,
      closingBalance,
    },
    transactions,
  };
}

function emptyStatement(filename: string): ParsedStatement {
  return {
    account: {
      name: bankNameFromFilename(filename),
      bankName: bankNameFromFilename(filename),
      currency: DEFAULT_CURRENCY,
      openingBalance: 0,
      closingBalance: 0,
    },
    transactions: [],
  };
}

// -------------------------------------------------------------------------
// OFX parser (tolerant tag scan; OFX is SGML-ish and often unclosed tags)
// -------------------------------------------------------------------------

/** Extracts the text value of the first occurrence of <TAG>value (optionally closed). */
function extractTag(source: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\r\n]*)`, 'i');
  const m = source.match(re);
  return m ? m[1].trim() : null;
}

function extractBlock(source: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = source.match(re);
  return m ? m[1] : null;
}

export function parseOFX(content: string, filename = 'statement.ofx'): ParsedStatement {
  const transactions: ParsedStatement['transactions'] = [];

  // Each <STMTTRN>...</STMTTRN> (or up to the next STMTTRN/ close tag) block.
  const trnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = trnRegex.exec(content)) !== null) {
    const block = match[1];
    const dtRaw = extractTag(block, 'DTPOSTED');
    const amtRaw = extractTag(block, 'TRNAMT');
    const name = extractTag(block, 'NAME');
    const memo = extractTag(block, 'MEMO');

    if (!dtRaw || !amtRaw) continue;
    const isoDate = normalizeDate(dtRaw);
    if (!isoDate) continue;
    const amount = parseAmount(amtRaw);
    if (isNaN(amount)) continue;

    const label = (name || memo || 'Transaction').trim();
    transactions.push({ date: isoDate, label, amount: round2(amount) });
  }

  const acctBlock = extractBlock(content, 'BANKACCTFROM') || content;
  const acctId = extractTag(acctBlock, 'ACCTID');
  const bankId = extractTag(acctBlock, 'BANKID');

  const ledgerBlock = extractBlock(content, 'LEDGERBAL') || content;
  const balAmtRaw = extractTag(ledgerBlock, 'BALAMT');

  const currency = extractTag(content, 'CURDEF') || DEFAULT_CURRENCY;

  let closingBalance: number | undefined;
  if (balAmtRaw) {
    const parsed = parseAmount(balAmtRaw);
    if (!isNaN(parsed)) closingBalance = round2(parsed);
  }
  if (closingBalance === undefined) {
    closingBalance = sumAmounts(transactions);
  }

  // BANKID is a routing number, not a human-readable bank name; prefer the
  // filename-derived name and only fall back to the routing id if needed.
  const bankName = bankNameFromFilename(filename) || bankId || 'Relevé importé';
  const ibanLast4 = acctId && acctId.length >= 4 ? acctId.slice(-4) : undefined;

  return {
    account: {
      name: acctId ? `Compte ${ibanLast4 ?? acctId}` : bankNameFromFilename(filename),
      bankName,
      currency,
      ibanLast4,
      openingBalance: 0,
      closingBalance,
    },
    transactions,
  };
}

// -------------------------------------------------------------------------
// QIF parser
// -------------------------------------------------------------------------

/**
 * QIF dates are conventionally US-formatted (MM/DD/YYYY or M/D'YY), unlike
 * the French DD/MM/YYYY convention `normalizeDate` assumes by default.
 * Falls back to `normalizeDate` for ISO/compact forms.
 */
function normalizeQifDate(raw: string): string | null {
  const s = raw.trim();

  let m = s.match(/^(\d{1,2})\/(\d{1,2})['/](\d{2,4})$/);
  if (m) {
    let year = m[3];
    if (year.length === 2) year = (parseInt(year, 10) < 70 ? '20' : '19') + year;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (month > 12 && day <= 12) {
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = m[3];
    if (month > 12 && day <= 12) {
      return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return normalizeDate(s);
}

export function parseQIF(content: string, filename = 'statement.qif'): ParsedStatement {
  const transactions: ParsedStatement['transactions'] = [];

  // Records are separated by a line containing just "^".
  const lines = content.split(/\r\n|\r|\n/);
  let current: { date?: string; amount?: number; payee?: string; memo?: string } = {};

  const flush = () => {
    if (current.date !== undefined && current.amount !== undefined && !isNaN(current.amount)) {
      const label = (current.payee || current.memo || 'Transaction').trim();
      transactions.push({ date: current.date, label, amount: round2(current.amount) });
    }
    current = {};
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '^') {
      flush();
      continue;
    }
    if (line.startsWith('!')) {
      // Header, e.g. !Type:Bank — ignore.
      continue;
    }
    const tag = line[0];
    const value = line.slice(1);
    switch (tag) {
      case 'D': {
        const iso = normalizeQifDate(value);
        if (iso) current.date = iso;
        break;
      }
      case 'T':
      case 'U': {
        const amt = parseAmount(value);
        if (!isNaN(amt)) current.amount = amt;
        break;
      }
      case 'P':
        current.payee = value.trim();
        break;
      case 'M':
        current.memo = value.trim();
        break;
      default:
        // Ignore other fields (N number, C cleared status, L category, etc.)
        break;
    }
  }
  // Flush a trailing record without a final "^" separator.
  flush();

  const closingBalance = sumAmounts(transactions);

  return {
    account: {
      name: bankNameFromFilename(filename),
      bankName: bankNameFromFilename(filename),
      currency: DEFAULT_CURRENCY,
      openingBalance: 0,
      closingBalance,
    },
    transactions,
  };
}

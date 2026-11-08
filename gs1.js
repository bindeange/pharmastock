// gs1.js - Parser GS1 pharmaceutique compatible DataMatrix / FNC1
function normalizePharmaDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let match = text.match(/^(20\d{2})[-/.]?(\d{2})[-/.]?(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{2})[-/.]?(\d{2})[-/.]?(\d{2})$/);
  if (match) return `20${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{2})[-/.](\d{2})[-/.](20\d{2})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function parseGS1Barcode(rawCode) {
  const clean = String(rawCode || '').replace(/\u001d/g, '|').replace(/\]d2|\]C1/g, '');
  const result = { gtin: null, lot: null, manufacturingDate: null, expiryDate: null, serial: null, raw: rawCode };
  let i = 0;
  function readVariable() {
    if (clean[i] === '|') i++;
    const rest = clean.slice(i);
    const fnc = rest.indexOf('|');
    const aiPositions = ['01', '10', '11', '17', '21'].map(ai => rest.indexOf(ai)).filter(pos => pos > 0);
    const nextAi = aiPositions.length ? Math.min(...aiPositions) : -1;
    const end = fnc >= 0 ? fnc : nextAi >= 0 ? nextAi : rest.length;
    const value = rest.slice(0, end);
    i += end;
    if (clean[i] === '|') i++;
    return value;
  }
  while (i < clean.length) {
    if (clean[i] === '|') { i++; continue; }
    const ai = clean.slice(i, i + 2);
    i += 2;
    if (ai === '01') { result.gtin = clean.slice(i, i + 14); i += 14; continue; }
    if (ai === '11' || ai === '17') {
      const d = clean.slice(i, i + 6); i += 6;
      const date = normalizePharmaDate(d);
      if (ai === '11') result.manufacturingDate = date;
      else result.expiryDate = date;
      continue;
    }
    if (ai === '10') { result.lot = readVariable(); continue; }
    if (ai === '21') { result.serial = readVariable(); continue; }
    break;
  }
  if (!result.gtin && !result.lot && !result.manufacturingDate && !result.expiryDate && !result.serial) return null;
  return { productCode: result.gtin, lotNumber: result.lot, manufacturingDate: result.manufacturingDate, expiryDate: result.expiryDate, serial: result.serial, rawCode: String(rawCode || ''), gs1: result };
}

function parsePharmaLotQr(rawCode) {
  const raw = String(rawCode || '').trim();
  if (!raw) return null;
  const gs1 = parseGS1Barcode(raw);
  if (gs1 && (gs1.lotNumber || gs1.manufacturingDate || gs1.expiryDate)) return gs1;

  let data = null;
  try { data = JSON.parse(raw); } catch (_) {}
  const fields = {};
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => { fields[String(key).toLowerCase()] = value; });
  } else {
    raw.split(/[|;\n]+/).forEach(part => {
      const match = part.trim().match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (match) fields[match[1].trim().toLowerCase()] = match[2].trim();
    });
  }
  const pick = (...names) => {
    for (const name of names) if (fields[name] !== undefined && fields[name] !== null) return String(fields[name]).trim();
    return null;
  };
  const parsed = {
    productCode: pick('prod', 'product', 'produit', 'gtin', 'cip', 'code produit', 'productcode'),
    lotNumber: pick('lot', 'batch', 'numero lot', 'num lot', 'lotnumber'),
    manufacturingDate: normalizePharmaDate(pick('mfg', 'fab', 'fabrication', 'date fabrication', 'manufacturingdate', 'production')),
    expiryDate: normalizePharmaDate(pick('exp', 'expiry', 'expiration', 'peremption', 'date peremption', 'expirydate', 'dlc')),
    rawCode: raw
  };
  return parsed.lotNumber || parsed.manufacturingDate || parsed.expiryDate ? parsed : null;
}
window.parseGS1Barcode = parseGS1Barcode;
window.parsePharmaLotQr = parsePharmaLotQr;

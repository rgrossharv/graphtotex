// Small deterministic PDFs with real xref tables for both extraction engines.
export function fixturePdf(contents = [
  'BT /F1 20 Tf 50 740 Td (A test document) Tj ET\nBT /F1 11 Tf 50 700 Td (Hello world. 100% & safe_text.) Tj ET',
  '0.2 0.5 0.7 rg 50 500 200 150 re f\nBT /F1 11 Tf 50 470 Td (Figure caption) Tj ET',
  ''
], extraPageDictionary = '', extraObjects = []) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${contents.length} /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (const content of contents) objects.push(
    `<< /Type /Page /Parent 2 0 R /Contents ${objects.length + 2} 0 R ${extraPageDictionary} >>`,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  );
  objects.push(...extraObjects);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

export const imagePdf = () => fixturePdf(['q 200 0 0 200 50 500 cm /Im1 Do Q'],
  '/Resources << /XObject << /Im1 6 0 R >> >>',
  ['<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\n0088ff>\nendstream']);

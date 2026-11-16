/** Just enough HTML handling for scraping well-known, stable pages. */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', copy: '©', reg: '®',
  trade: '™', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', middot: '·', bull: '•', deg: '°', times: '×',
};

const ACCENTED: Record<string, string> = { grave: '̀', acute: '́', circ: '̂', tilde: '̃', uml: '̈', ring: '̊', cedil: '̧' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (ref in NAMED) return NAMED[ref]!;
    const m = /^([a-z])(grave|acute|circ|tilde|uml|ring|cedil)$/i.exec(ref);
    return m ? (m[1]! + ACCENTED[m[2]!.toLowerCase()]!).normalize('NFC') : whole;
  });
}

/** Strip tags, turning <br> and block ends into newlines, and decode entities. */
export function toText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parse "26,793,390" → 26793390. */
export const toInt = (s: string | undefined): number => (s ? Number(s.replace(/[^\d]/g, '')) || 0 : 0);

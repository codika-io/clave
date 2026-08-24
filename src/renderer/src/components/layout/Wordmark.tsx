/**
 * "Clave", beside the traffic lights. The one piece of the Antasphere identity
 * in the app, and the only thing in it not set in Geist.
 *
 * OUTLINES, NOT A FONT — and that is a licence decision, not a nicety. The face
 * is Sentient Light, Fontshare's, under the ITF Free Font Licence: free to use,
 * including in a logo, and NOT free to redistribute as a file. Clave is a public
 * repo that ships a packaged app through GitHub Releases, so a bundled .woff2
 * inside the asar would be redistribution. An outline is drawing, not type, so
 * the wordmark travels and the licence stays where it belongs. Same call, same
 * reasoning, as the website's outlined "Antasphere" (company/website,
 * src/brand/assets.ts) — read that file before changing this one.
 *
 * ⚠️ Do NOT reintroduce a Sentient @font-face to "make it easier to edit". The
 * string is fixed; if it ever has to change, rebuild the path.
 *
 * How the path was outlined, for the day it must be rebuilt:
 *  - source: Sentient Light 300, upright, the `--font-display` woff2 the
 *    Astro Fonts API downloads to company/website/apps/website/.astro/fonts/
 *    (font-display-300-normal-*.woff2). The file is NOT kept in this repo;
 *    fetch it there, outline, and throw it away again.
 *  - glyphs: fontTools SVGPathPen over the glyph set, one pen per glyph.
 *  - advances: hmtx, plus the 0.005em tracking the design carries, plus the
 *    GPOS kern pairs that actually apply to this word — a/v −20 and v/e −29
 *    at 1000 upem. Skip those two and the word is 49 units wide of what a
 *    browser would shape.
 *  - transform: Transform(1, 0, 0, −1, −minX, maxY) — font units are Y-up and
 *    SVG is Y-down — so the ink box lands at the origin.
 *  - box: the ink bounds of the whole word, quadratic extrema included,
 *    x 0 → 2464, y 0 → 762 at 1000 upem. That is 2.464em × 0.762em, so at
 *    the 16px this used to be set at the mark is 39.4 × 12.2 CSS px.
 *
 * Sized by HEIGHT (--wordmark-h) with width following the ratio, because the
 * height is what has to sit on the traffic lights' centre line.
 */
export function Wordmark(): React.ReactElement {
  return (
    <svg
      className="wordmark"
      viewBox="0 0 2464 762"
      role="img"
      aria-label="Clave"
      focusable="false"
    >
      <path
        d="M340.0 760Q179.0 760 89.5 668.0Q0.0 576 0.0 411Q0.0 251 91.5 153.0Q183.0 55 334.0 55Q438.0 55 554.0 105L568.0 244H543.0L502.0 179Q450.0 100 329.0 100Q220.0 100 150.5 187.0Q81.0 274 81.0 410Q81.0 548 152.5 631.0Q224.0 714 343.0 714Q486.0 714 555.0 566H578.0L559.0 694Q523.0 724 463.0 742.0Q403.0 760 340.0 760Z M897.0 750H666.0V728L708.0 715Q730.0 707 738.0 696.5Q746.0 686 746.0 663V132Q746.0 105 736.5 92.0Q727.0 79 706.0 76L667.0 71V49L797.0 0L817.0 12V663Q817.0 686 824.5 696.5Q832.0 707 854.0 715L897.0 728Z M1142.0 760Q1072.0 760 1030.0 722.0Q988.0 684 988.0 621Q988.0 516 1117.0 474Q1175.0 455 1286.0 450V417Q1286.0 280 1183.0 280Q1139.0 280 1108.0 297Q1082.0 312 1057.0 388H1030.0L1003.0 303Q1098.0 239 1191.0 239Q1278.0 239 1317.5 280.5Q1357.0 322 1357.0 418V640Q1357.0 668 1366.0 680.0Q1375.0 692 1397.0 693L1435.0 695L1439.0 717L1331.0 760H1312.0L1289.0 688Q1262.0 721 1222.5 740.5Q1183.0 760 1142.0 760ZM1168.0 706Q1232.0 706 1286.0 649V485Q1204.0 488 1160.0 501Q1063.0 528 1063.0 611Q1063.0 655 1091.5 680.5Q1120.0 706 1168.0 706Z M1748.0 741 1708.0 762 1527.0 338Q1516.0 312 1507.5 302.5Q1499.0 293 1482.0 285L1451.0 271V249H1669.0V271L1640.0 280Q1600.0 291 1600.0 312Q1600.0 321 1606.0 336L1740.0 657L1874.0 336Q1880.0 321 1880.0 312Q1880.0 291 1839.0 280L1810.0 271V249H1998.0V271L1964.0 285Q1948.0 293 1939.0 303.0Q1930.0 313 1919.0 338Z M2263.0 760Q2155.0 760 2093.0 693.0Q2031.0 626 2031.0 501Q2031.0 391 2094.5 315.0Q2158.0 239 2255.0 239Q2345.0 239 2402.5 297.0Q2460.0 355 2464.0 461V483H2107.0V500Q2107.0 599 2155.0 654.0Q2203.0 709 2285.0 709.0Q2367.0 709 2431.0 660L2450.0 685Q2370.0 760 2263.0 760ZM2111.0 444 2390.0 441Q2387.0 369 2351.0 324.0Q2315.0 279 2257.0 279.0Q2199.0 279 2160.5 323.5Q2122.0 368 2111.0 444Z"
        fill="currentColor"
      />
    </svg>
  )
}

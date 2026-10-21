/**
 * arXiv withdrawal helpers.
 *
 * arXiv keeps a paper's abstract page forever, but the PDF endpoint only
 * serves versions that were never withdrawn. When an author withdraws a
 * paper, arXiv replaces the current version with a stub and stops serving
 * its PDF: `/pdf/<id>` answers 404 while `/abs/<id>` stays live and states
 * the withdrawal.
 *
 * The corpus is a snapshot, so a paper harvested while it was still live
 * ends up holding a PDF link that rots upstream afterwards. The link checker
 * has to tell that apart from a genuinely broken corpus entry, otherwise
 * every withdrawal upstream turns this repo's CI red for no good reason.
 */

/** The arXiv PDF endpoint, capturing the paper id. */
const ARXIV_PDF_URL = /^https?:\/\/arxiv\.org\/pdf\/([^/?#]+)$/;

/** The arXiv abstract endpoint, capturing the paper id. */
const ARXIV_ABS_URL = /^https?:\/\/arxiv\.org\/abs\/([^/?#]+)$/;

/**
 * The paper id an arXiv URL points at, or null when the URL is not arXiv's.
 *
 * A trailing version suffix (`v1`, `v2`) is dropped: the bare id addresses
 * the paper, and it is the bare id the abstract page is served under.
 */
export function arxivPaperId(url: string): string | null {
  const match = ARXIV_PDF_URL.exec(url) ?? ARXIV_ABS_URL.exec(url);
  const id = match?.[1];
  return id ? id.replace(/v\d+$/, "") : null;
}

/** The abstract page of an arXiv paper, which survives withdrawal. */
export function arxivAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

/**
 * True when an arXiv abstract page states that the paper was withdrawn.
 *
 * arXiv renders a single banner for this, phrased "This paper has been
 * withdrawn by <author>". Live papers carry no such banner.
 */
export function isWithdrawnPaper(html: string): boolean {
  return /This paper has been withdrawn by/i.test(html);
}

/**
 * True when `url` is an arXiv PDF link whose paper was withdrawn upstream.
 *
 * The corpus is a snapshot, so a paper that was still live when it was
 * harvested can be withdrawn afterwards. That is the world changing, not the
 * corpus lying, and the caller wants to tell the two apart.
 */
export async function isWithdrawnUpstream(url: string, timeoutMs: number): Promise<boolean> {
  const id = arxivPaperId(url);
  if (!id) return false;
  try {
    const res = await fetch(arxivAbsUrl(id), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "cogitatome-link-checker/1.0" }
    });
    if (!res.ok) return false;
    return isWithdrawnPaper(await res.text());
  } catch {
    return false;
  }
}

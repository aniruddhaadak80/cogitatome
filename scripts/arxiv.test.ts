import { describe, expect, it } from "vitest";
import { arxivAbsUrl, arxivPaperId, isWithdrawnPaper } from "./arxiv";

/**
 * The corpus is a snapshot of arXiv, and papers get withdrawn after they are
 * harvested. These tests pin the distinction the link checker relies on:
 * a withdrawn paper is still listed (its abstract page resolves), while its
 * PDF endpoint stops serving the file.
 */

describe("arxivPaperId", () => {
  it("reads the id out of a PDF url", () => {
    expect(arxivPaperId("https://arxiv.org/pdf/2505.13514")).toBe("2505.13514");
  });

  it("reads the id out of an abstract url", () => {
    expect(arxivPaperId("https://arxiv.org/abs/2505.13514")).toBe("2505.13514");
  });

  it("drops the version suffix, so the id addresses the paper", () => {
    expect(arxivPaperId("https://arxiv.org/pdf/2505.13514v2")).toBe("2505.13514");
    expect(arxivPaperId("https://arxiv.org/abs/2505.13514v2")).toBe("2505.13514");
  });

  it("ignores urls that are not arxiv's", () => {
    expect(arxivPaperId("https://example.com/pdf/2505.13514")).toBeNull();
    expect(arxivPaperId("https://arxiv.org/list/cs.CL/recent")).toBeNull();
  });
});

describe("arxivAbsUrl", () => {
  it("points at the abstract page, which survives withdrawal", () => {
    expect(arxivAbsUrl("2505.13514")).toBe("https://arxiv.org/abs/2505.13514");
  });
});

describe("isWithdrawnPaper", () => {
  it("recognises the withdrawal banner arXiv renders", () => {
    const html = '<span class="error" style="border: 2px solid grey">This paper has been withdrawn by Shuxun Wang</span>';
    expect(isWithdrawnPaper(html)).toBe(true);
  });

  it("does not fire on a live paper's page", () => {
    const html = '<h1 class="title mathjax"><span class="descriptor">Title:</span>Induction Head Toxicity</h1>';
    expect(isWithdrawnPaper(html)).toBe(false);
  });
});

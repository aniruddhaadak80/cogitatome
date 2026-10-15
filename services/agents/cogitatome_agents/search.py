"""Inverted-index + BM25 ranking over the bundled corpus.

Each document's token multiset is built from weighted fields — title and tags
are counted three times so a match there dominates a passing mention in the
summary. Scores use the BM25 Okapi ranking function with ``k1 = 1.5`` and
``b = 0.75`` and a non-negative ("Lucene") idf, ``log(1 + (N - df + 0.5)/(df + 0.5))``.

The index is built once and cached; results are ordered by descending score and
broken by ascending entry id, so ranking is fully deterministic. A ``kind``
filter is applied after scoring against the global idf (standard behaviour for
a faceted filter over a static, tiny corpus).
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache

from .corpus import load_corpus
from .schemas import CorpusEntry

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Multipliers applied when building a document's token multiset.
_TITLE_WEIGHT = 3
_TAG_WEIGHT = 3
_SUMMARY_WEIGHT = 1
_AUTHOR_WEIGHT = 1
_VENUE_WEIGHT = 1

_K1 = 1.5
_B = 0.75


def tokenize(text: str) -> list[str]:
    """Lowercase and split ``text`` into alphanumeric tokens."""

    return _TOKEN_RE.findall(text.lower())


@dataclass(frozen=True)
class _Index:
    """A static BM25 index over the corpus."""

    postings: dict[str, dict[str, int]]  # token -> {entry_id: term-frequency}
    entries: dict[str, tuple[CorpusEntry, dict[str, int]]]
    doc_len: dict[str, int]
    avgdl: float
    idf: dict[str, float]
    n_docs: int

    def search(self, query: str, kind: str | None, limit: int) -> list[tuple[CorpusEntry, float]]:
        """Return up to ``limit`` scored hits for ``query`` filtered by ``kind``."""

        query_tokens = set(tokenize(query))
        if not query_tokens:
            return []

        candidates: set[str] = set()
        for token in query_tokens:
            posting = self.postings.get(token)
            if posting:
                candidates.update(posting)

        scored: list[tuple[float, str]] = []
        for entry_id in candidates:
            entry, tf = self.entries[entry_id]
            if kind is not None and entry.kind != kind:
                continue
            dl = self.doc_len[entry_id]
            score = 0.0
            for token in query_tokens:
                freq = tf.get(token, 0)
                if freq == 0 or self.avgdl <= 0.0:
                    continue
                score += (
                    self.idf[token] * (freq * (_K1 + 1.0)) / (freq + _K1 * (1.0 - _B + _B * dl / self.avgdl))
                )
            if score > 0.0:
                scored.append((score, entry_id))

        # Descending score; ties broken by ascending id for determinism.
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [(self.entries[entry_id][0], score) for score, entry_id in scored[:limit]]


def _build_index() -> _Index:
    entries = load_corpus()
    postings: dict[str, dict[str, int]] = {}
    entries_map: dict[str, tuple[CorpusEntry, dict[str, int]]] = {}
    doc_len: dict[str, int] = {}

    for entry in entries:
        tokens: list[str] = []
        tokens += tokenize(entry.title) * _TITLE_WEIGHT
        tokens += tokenize(" ".join(entry.tags)) * _TAG_WEIGHT
        tokens += tokenize(entry.summary) * _SUMMARY_WEIGHT
        tokens += tokenize(" ".join(entry.authors)) * _AUTHOR_WEIGHT
        tokens += tokenize(entry.venue) * _VENUE_WEIGHT

        tf: dict[str, int] = {}
        for token in tokens:
            tf[token] = tf.get(token, 0) + 1
        entries_map[entry.id] = (entry, tf)
        doc_len[entry.id] = len(tokens)
        for token, count in tf.items():
            postings.setdefault(token, {})[entry.id] = count

    n_docs = len(entries)
    avgdl = (sum(doc_len.values()) / n_docs) if n_docs else 0.0
    idf: dict[str, float] = {}
    for token, posting in postings.items():
        df = len(posting)
        idf[token] = math.log(1.0 + (n_docs - df + 0.5) / (df + 0.5))

    return _Index(
        postings=postings,
        entries=entries_map,
        doc_len=doc_len,
        avgdl=avgdl,
        idf=idf,
        n_docs=n_docs,
    )


@lru_cache(maxsize=1)
def get_index() -> _Index:
    """Return the cached corpus index."""

    return _build_index()


def search_corpus(query: str, kind: str | None, limit: int) -> list[tuple[CorpusEntry, float]]:
    """Search the corpus and return ``(entry, score)`` hits ranked by relevance."""

    return get_index().search(query=query, kind=kind, limit=limit)

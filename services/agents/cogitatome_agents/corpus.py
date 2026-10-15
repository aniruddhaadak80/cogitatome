"""Boot-time access to the bundled interpretability corpus.

``corpus.json`` ships inside the package (see ``pyproject`` ``package-data``)
and is parsed into typed :class:`~cogitatome_agents.schemas.CorpusEntry`
records exactly once. Loading is cached so repeated searches reuse the same
immutable tuple; there are no network calls — the corpus is fully offline.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .schemas import CorpusEntry

_CORPUS_FILENAME = "corpus.json"
# Search order: the service root next to the package (source tree / Docker image),
# then inside the package (should it ever be bundled as package data), then the
# process working directory as a last resort.
_CORPUS_CANDIDATES = (
    Path(__file__).resolve().parent.parent / _CORPUS_FILENAME,
    Path(__file__).resolve().parent / _CORPUS_FILENAME,
    Path.cwd() / _CORPUS_FILENAME,
)


def _corpus_path() -> Path:
    for candidate in _CORPUS_CANDIDATES:
        if candidate.is_file():
            return candidate
    searched = ", ".join(str(path) for path in _CORPUS_CANDIDATES)
    raise FileNotFoundError(f"corpus.json not found (searched: {searched})")


@lru_cache(maxsize=1)
def load_corpus() -> tuple[CorpusEntry, ...]:
    """Parse ``corpus.json`` into validated records (cached)."""

    data = json.loads(_corpus_path().read_text(encoding="utf-8"))
    return tuple(CorpusEntry.model_validate(item) for item in data)


@lru_cache(maxsize=1)
def available_kinds() -> tuple[str, ...]:
    """Return the sorted set of distinct ``kind`` values in the corpus."""

    return tuple(sorted({entry.kind for entry in load_corpus()}))

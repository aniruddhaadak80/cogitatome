"""Offline corpus search endpoint tests: ranking, filters and integrity."""

from __future__ import annotations

from cogitatome_agents.corpus import load_corpus


def test_corpus_is_populated():
    entries = load_corpus()
    assert len(entries) >= 30


def test_search_returns_ranked_results(client):
    response = client.get("/v1/corpus/search", params={"q": "sparse autoencoder superposition", "limit": 5})
    assert response.status_code == 200
    body = response.json()
    ids = [hit["entry"]["id"] for hit in body["results"]]
    assert "2309.08600" in ids  # Sparse Autoencoders Find Highly Interpretable Features
    scores = [hit["score"] for hit in body["results"]]
    assert scores == sorted(scores, reverse=True)


def test_scores_are_descending_with_deterministic_ties(client):
    first = client.get("/v1/corpus/search", params={"q": "attention transformer"}).json()
    second = client.get("/v1/corpus/search", params={"q": "attention transformer"}).json()
    assert first == second
    scores = [hit["score"] for hit in first["results"]]
    assert scores == sorted(scores, reverse=True)


def test_kind_filter_restricts_results(client):
    response = client.get(
        "/v1/corpus/search", params={"q": "language model", "kind": "benchmark", "limit": 10}
    )
    body = response.json()
    assert body["kind"] == "benchmark"
    assert body["results"], "expected at least one benchmark hit"
    assert all(hit["entry"]["kind"] == "benchmark" for hit in body["results"])


def test_limit_is_respected(client):
    response = client.get("/v1/corpus/search", params={"q": "model", "limit": 3})
    body = response.json()
    assert len(body["results"]) <= 3


def test_empty_query_returns_no_hits(client):
    response = client.get("/v1/corpus/search", params={"q": "", "limit": 10})
    body = response.json()
    assert body["total"] == 0
    assert body["results"] == []


def test_result_entries_are_complete(client):
    response = client.get("/v1/corpus/search", params={"q": "interpretability", "limit": 5})
    for hit in response.json()["results"]:
        entry = hit["entry"]
        assert entry["url"].startswith("https://arxiv.org/abs/")
        assert entry["id"] and entry["title"] and entry["authors"]
        assert isinstance(entry["year"], int)
        assert hit["score"] > 0.0


def test_all_urls_are_real_arxiv_links():
    for entry in load_corpus():
        assert entry.url.startswith("https://arxiv.org/abs/")
        # arXiv ids render as YYMM.NNNNN in the url path.
        arxiv_id = entry.url.rsplit("/", 1)[-1]
        assert arxiv_id == entry.id

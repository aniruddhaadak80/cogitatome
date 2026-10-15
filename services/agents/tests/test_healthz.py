"""Health, OpenAPI, request-id and liveness tests."""

from __future__ import annotations


def test_healthz_payload(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": "0.1.0",
        "service": "cogitatome-agents",
    }


def test_openapi_documents_all_routes(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    expected = {
        "/healthz",
        "/v1/sae/train",
        "/v1/attribution",
        "/v1/probes/fit",
        "/v1/patch/sweep",
        "/v1/corpus/search",
    }
    assert expected.issubset(set(spec["paths"]))
    assert spec["components"]["schemas"], "OpenAPI should expose typed schemas"


def test_request_id_is_generated(client):
    response = client.get("/healthz")
    assert response.headers.get("x-request-id")
    assert len(response.headers["x-request-id"]) > 0


def test_request_id_is_honoured(client):
    response = client.get("/healthz", headers={"X-Request-ID": "trace-42"})
    assert response.headers["x-request-id"] == "trace-42"

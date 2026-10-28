"""Optional text embeddings for faculty matching (Voyage AI). Without VOYAGE_API_KEY the matcher
uses Postgres full-text search instead, so this is never required.
"""

from __future__ import annotations

import os

import httpx

MODEL = "voyage-3.5"
DIMENSIONS = 1024


def embed(
    texts: list[str], input_type: str = "document", client: httpx.Client | None = None
) -> list[list[float]] | None:
    key = os.environ.get("VOYAGE_API_KEY")
    if not key or not texts:
        return None
    client = client or httpx.Client(timeout=60.0)
    response = client.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {key}"},
        json={"input": texts, "model": MODEL, "input_type": input_type, "output_dimension": DIMENSIONS},
    )
    response.raise_for_status()
    return [item["embedding"] for item in response.json()["data"]]

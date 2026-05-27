import pytest
from backend.core.chunker import chunk_text, estimate_tokens


def test_short_text_no_chunk():
    text = "Hello world"
    chunks = chunk_text(text, max_chars=100)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_long_text_multiple_chunks():
    text = "a" * 2000
    chunks = chunk_text(text, max_chars=1000, overlap=100)
    assert len(chunks) == 3


def test_overlap_preserved():
    text = "abcdefghij" * 200  # 2000 chars
    chunks = chunk_text(text, max_chars=1000, overlap=100)
    # Second chunk should start at char 900 (1000 - 100)
    assert chunks[1][:100] == text[900:1000]


def test_estimate_tokens():
    text = "a" * 300
    tokens = estimate_tokens(text)
    assert tokens == 200  # 300 / 1.5 = 200

import pytest
from backend.core.chunker import chunk_text


def test_chunk_text_returns_empty_for_blank_text():
    assert chunk_text("") == []
    assert chunk_text("   \n\t") == []


def test_chunk_text_rejects_overlap_not_smaller_than_max_chars():
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("abcdef", max_chars=5, overlap=5)


def test_chunk_text_rejects_overlap_greater_than_max_chars():
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("abcdef", max_chars=5, overlap=10)


def test_chunk_text_single_chunk_when_text_fits():
    result = chunk_text("hello", max_chars=100, overlap=10)
    assert result == ["hello"]


def test_chunk_text_splits_correctly():
    text = "a" * 100
    result = chunk_text(text, max_chars=30, overlap=10)
    assert len(result) > 1
    for chunk in result:
        assert len(chunk) <= 30

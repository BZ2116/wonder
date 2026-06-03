from typing import List


def chunk_text(text: str, max_chars: int = 7000, overlap: int = 500) -> List[str]:
    if overlap >= max_chars:
        raise ValueError("overlap must be smaller than max_chars")
    if not text or not text.strip():
        return []
    if len(text) <= max_chars:
        return [text]

    chunks = []
    start = 0

    while start < len(text):
        end = start + max_chars
        chunk = text[start:end]
        chunks.append(chunk)

        if end >= len(text):
            break

        start = end - overlap
        if start < 0:
            start = 0

    return chunks


def estimate_tokens(text: str) -> int:
    return int(len(text) / 1.5)

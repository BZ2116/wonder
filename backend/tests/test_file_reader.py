import pytest
from backend.core.file_reader import read_file


def test_unsupported_extension_raises_value_error():
    with pytest.raises(ValueError, match="Unsupported"):
        read_file("report.xlsx", b"\x00")


def test_unsupported_binary_extension_raises():
    with pytest.raises(ValueError, match="Unsupported"):
        read_file("image.png", b"\x89PNG")


def test_empty_pdf_bytes_raises_safe_error():
    with pytest.raises(Exception):
        read_file("empty.pdf", b"")


def test_corrupt_docx_bytes_raises_safe_error():
    with pytest.raises(Exception):
        read_file("bad.docx", b"not a real docx")


def test_encrypted_pdf_raises_safe_error():
    # Minimal PDF that triggers encryption detection
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n"
    with pytest.raises(Exception):
        read_file("encrypted.pdf", pdf_bytes)


def test_read_txt_with_valid_utf8():
    result = read_file("notes.txt", "hello world".encode("utf-8"))
    assert "hello world" in result

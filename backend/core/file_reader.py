import re
from io import BytesIO
from pypdf import PdfReader
from docx import Document


SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".log"}


def read_pdf(file_bytes: bytes) -> str:
    text_parts = []
    try:
        reader = PdfReader(BytesIO(file_bytes))
    except Exception as exc:
        raise Exception(f"Failed to read PDF: {exc}") from exc
    if getattr(reader, "is_encrypted", False):
        raise Exception("Cannot read encrypted PDF")
    for page_idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
            if text.strip():
                text_parts.append(f"\n\n--- Page {page_idx + 1} ---\n{text}")
        except Exception:
            text_parts.append(
                f"\n\n--- Page {page_idx + 1} ---\n[ extraction failed ]"
            )
    return "\n".join(text_parts)


def read_docx(file_bytes: bytes) -> str:
    try:
        doc = Document(BytesIO(file_bytes))
    except Exception as exc:
        raise Exception(f"Failed to read DOCX: {exc}") from exc
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)


def read_text(file_bytes: bytes) -> str:
    for enc in ["utf-8", "gbk", "gb2312", "utf-16"]:
        try:
            return file_bytes.decode(enc)
        except Exception:
            continue
    return file_bytes.decode("utf-8", errors="ignore")


def read_file(filename: str, file_bytes: bytes) -> str:
    name_lower = filename.lower()
    ext = "." + name_lower.rsplit(".", 1)[-1] if "." in name_lower else ""
    if ext and ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension: {ext}")
    if name_lower.endswith(".pdf"):
        return read_pdf(file_bytes)
    if name_lower.endswith(".docx"):
        return read_docx(file_bytes)
    return read_text(file_bytes)


def clean_text(text: str) -> str:
    text = text.replace("　", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()

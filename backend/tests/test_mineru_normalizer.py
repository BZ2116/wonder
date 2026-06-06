from backend.rag.mineru_normalizer import normalize_mineru_payload, normalize_plain_pdf_text


def test_normalize_mineru_payload_extracts_pages_blocks_and_labels():
    payload = {
        "title": "LIME: A Method for Low-light IMage Enhancement",
        "authors": ["Xiaojie Guo"],
        "abstract": "We propose LIME.",
        "pages": [
            {
                "page": 2,
                "blocks": [
                    {"type": "heading", "text": "2.2 Illumination Map Refinement"},
                    {"type": "paragraph", "text": "The optimization objective is defined below."},
                    {"type": "formula", "text": "min_T ||T_hat - T||_F^2", "label": "Eq. (8)"},
                    {"type": "figure_caption", "text": "Figure 4: Illumination maps.", "label": "Figure 4"},
                ],
            }
        ],
        "markdown": "# LIME\n\n## 2.2 Illumination Map Refinement",
    }

    doc = normalize_mineru_payload(
        payload,
        document_id="doc-1",
        file_name="lime.pdf",
        parser="mineru_precision",
        parser_version="vlm",
    )

    assert doc.document_id == "doc-1"
    assert doc.file_name == "lime.pdf"
    assert doc.title == "LIME: A Method for Low-light IMage Enhancement"
    assert doc.authors == ["Xiaojie Guo"]
    assert doc.abstract == "We propose LIME."
    assert doc.page_count == 1
    assert doc.blocks[0].block_type == "heading"
    assert doc.blocks[0].page_start == 2
    assert doc.blocks[2].block_type == "formula"
    assert doc.blocks[2].label == "Eq. (8)"
    assert doc.blocks[3].block_type == "figure_caption"
    assert doc.blocks[3].label == "Figure 4"
    assert doc.parser == "mineru_precision"
    assert doc.parser_version == "vlm"


def test_normalize_plain_pdf_text_returns_fallback_paper_document():
    doc = normalize_plain_pdf_text(
        text="Title Line\n\n1 Introduction\nThis is the first page.\n\nReferences\n[1] A paper.",
        document_id="doc-fallback",
        file_name="fallback.pdf",
    )

    assert doc.parser == "pypdf"
    assert doc.document_id == "doc-fallback"
    assert doc.file_name == "fallback.pdf"
    assert doc.pages[0].page_number == 1
    assert doc.blocks[0].text.startswith("Title Line")

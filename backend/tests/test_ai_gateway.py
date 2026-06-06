"""Tests for the AI Gateway layer -- analysis, QA, and health endpoints."""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.agents.qa import QAAgent


# ── Gateway analysis with mocked provider ────────────────────────────────────


def _parse_sse_events(text: str) -> list[tuple[str, str]]:
    """Parse SSE text into list of (event, data) tuples."""
    events = []
    current_event = "message"
    for line in text.split("\n"):
        if line.startswith("event: "):
            current_event = line[7:].strip()
        elif line.startswith("data: "):
            events.append((current_event, line[6:]))
            current_event = "message"
    return events


class TestGatewayAnalysis:
    @patch("backend.api.analysis._build_provider")
    @patch("backend.agents.base.BaseAgent._get_provider")
    def test_gateway_returns_ok_with_valid_provider(self, mock_get_provider, mock_build):
        from backend.main import app

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "Parsed reading card content"
        mock_get_provider.return_value = mock_provider
        mock_build.return_value = mock_provider

        client = TestClient(app)
        response = client.post("/api/analysis/gateway", json={
            "doc_id": "test-doc-1",
            "file_name": "test.pdf",
            "text": "This is a sample document text for analysis.",
            "global_profile": "I study AI",
        })

        assert response.status_code == 200
        import json
        events = _parse_sse_events(response.text)
        event_names = [e[0] for e in events]
        assert "agent_start" in event_names
        assert "agent_done" in event_names
        assert "complete" in event_names
        complete_data = json.loads([d for e, d in events if e == "complete"][0])
        assert complete_data["doc_id"] == "test-doc-1"
        assert complete_data["status"] == "ok"

    @patch("backend.api.analysis._build_provider")
    @patch("backend.agents.base.BaseAgent._get_provider")
    def test_gateway_returns_reading_card(self, mock_get_provider, mock_build):
        from backend.main import app

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "# Reading Card\n\nKey findings..."
        mock_get_provider.return_value = mock_provider
        mock_build.return_value = mock_provider

        client = TestClient(app)
        response = client.post("/api/analysis/gateway", json={
            "doc_id": "doc-2",
            "file_name": "paper.pdf",
            "text": "Sample text for analysis.",
        })

        assert response.status_code == 200
        import json
        events = _parse_sse_events(response.text)
        complete_data = json.loads([d for e, d in events if e == "complete"][0])
        assert "reading_card" in complete_data
        assert len(complete_data["reading_card"]) > 0

    def test_gateway_rejects_empty_text(self):
        from backend.main import app

        client = TestClient(app)
        response = client.post("/api/analysis/gateway", json={
            "doc_id": "doc-3",
            "file_name": "empty.pdf",
            "text": "   ",
        })

        assert response.status_code == 400

    @patch("backend.api.analysis._build_provider")
    @patch("backend.agents.base.BaseAgent._get_provider")
    def test_gateway_returns_decision_brief_fields(self, mock_get_provider, mock_build):
        """Complete event must include decision_brief, focused_signals, and scores."""
        import json
        from backend.main import app
        import backend.api.analysis as analysis_module

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "Parsed reading card"
        mock_get_provider.return_value = mock_provider
        mock_build.return_value = mock_provider

        # Patch Orchestrator to return a controlled streaming sequence
        class FakeOrchestrator:
            def run_streaming(self, **kwargs):
                yield {"step": "literature", "status": "running"}
                yield {"step": "literature", "status": "done", "data": "# Reading Card\nMethod reuse."}
                yield {"step": "literature_meta", "data": {"paper_title": "Test Paper"}}
                yield {"step": "relation", "status": "running"}
                yield {
                    "step": "relation", "status": "done",
                    "data": "Highly relevant for method reference."
                }
                yield {"step": "writing", "status": "running"}
                yield {"step": "writing", "status": "done", "data": "Writing materials."}
                yield {"step": "todo", "status": "running"}
                yield {"step": "todo", "status": "done", "data": "- Task 1\n- Task 2"}
                yield {"step": "relation_meta", "status": "done", "data": {
                    "fit_score": 75,
                    "fit_reason": "directly applicable",
                    "relation_type": "method_reference",
                    "recommended_action": "deep_read",
                    "suggested_placement": {"sub_direction": "RAG", "tags": ["rag", "retrieval"]},
                    "novelty_for_kb": "New method",
                    "readme_suggestions": [],
                    "decision_brief": {
                        "verdict": "deep_read",
                        "confidence": 80,
                        "best_use": "method_reference",
                        "why_it_matters": ["useful method"],
                        "key_takeaways": ["takeaway"],
                        "novelty_points": ["novel"],
                        "overlap_points": [],
                        "conflict_or_risk_points": ["needs validation"],
                        "next_action": "read method",
                    },
                    "knowledge_increment_score": 70,
                    "evidence_strength_score": 65,
                    "actionability_score": 85,
                }}
                yield {"step": "focused_signals", "data": [{
                    "text": "useful method",
                    "signal_type": "method",
                    "section_type": "method",
                    "chunk_index": 0,
                    "evidence_hint": "method",
                }]}
                yield {"step": "writing_meta", "status": "done", "data": {
                    "usable_claims": ["claim"],
                    "method_references": [],
                    "theory_references": [],
                    "possible_literature_review_use": "",
                    "limitations_or_critique": "",
                }}

        with patch.object(analysis_module, "Orchestrator", lambda agents: FakeOrchestrator()):
            client = TestClient(app)
            response = client.post("/api/analysis/gateway", json={
                "doc_id": "doc-decision",
                "file_name": "paper.pdf",
                "text": "Sample text for analysis.",
            })

        assert response.status_code == 200
        events = _parse_sse_events(response.text)
        complete_data = json.loads([d for e, d in events if e == "complete"][0])

        # Assert decision_brief
        assert "decision_brief" in complete_data
        db = complete_data["decision_brief"]
        assert db["verdict"] == "deep_read"
        assert db["confidence"] == 80
        assert db["best_use"] == "method_reference"
        assert "useful method" in db["why_it_matters"]
        assert "takeaway" in db["key_takeaways"]
        assert "novel" in db["novelty_points"]
        assert db["overlap_points"] == []
        assert "needs validation" in db["conflict_or_risk_points"]
        assert db["next_action"] == "read method"

        # Assert focused_signals
        assert "focused_signals" in complete_data
        assert len(complete_data["focused_signals"]) == 1
        assert complete_data["focused_signals"][0]["text"] == "useful method"
        assert complete_data["focused_signals"][0]["signal_type"] == "method"

        # Assert scores
        assert complete_data["knowledge_increment_score"] == 70
        assert complete_data["evidence_strength_score"] == 65
        assert complete_data["actionability_score"] == 85

    @patch("backend.api.analysis._build_provider")
    @patch("backend.agents.base.BaseAgent._get_provider")
    def test_gateway_accepts_chat_config(self, mock_get_provider, mock_build):
        from backend.main import app

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "Analysis result"
        mock_get_provider.return_value = mock_provider
        mock_build.return_value = mock_provider

        client = TestClient(app)
        response = client.post("/api/analysis/gateway", json={
            "doc_id": "doc-4",
            "file_name": "test.pdf",
            "text": "Some text.",
            "chat_config": {
                "provider": "openai_compatible",
                "apiKey": "sk-test",
                "baseUrl": "https://api.openai.com/v1",
                "model": "gpt-4o",
            },
        })

        assert response.status_code == 200
        # Verify _build_provider was called with ChatConfig
        mock_build.assert_called_once()
        call_arg = mock_build.call_args[0][0]
        assert call_arg is not None
        assert call_arg.provider == "openai_compatible"


# ── QA with mocked provider ──────────────────────────────────────────────────


class TestKnowledgeQA:
    @patch("backend.api.knowledge.get_orchestrator")
    def test_ask_returns_answer(self, mock_get_orchestrator):
        from backend.main import app

        mock_orchestrator = MagicMock()
        mock_orchestrator.route_task.return_value = {
            "answer": "The answer is 42.",
            "source_doc_ids": ["doc-1"],
            "source_chunks": ["chunk-1"],
        }
        mock_get_orchestrator.return_value = mock_orchestrator

        client = TestClient(app)
        response = client.post("/api/knowledge/ask", json={
            "question": "What is the answer?",
        })

        assert response.status_code == 200
        body = response.json()
        assert body["answer"] == "The answer is 42."
        assert body["source_doc_ids"] == ["doc-1"]

    @patch("backend.api.knowledge.get_orchestrator")
    def test_ask_passes_chat_config(self, mock_get_orchestrator):
        from backend.main import app

        mock_orchestrator = MagicMock()
        mock_orchestrator.route_task.return_value = {
            "answer": "Yes.",
            "source_doc_ids": [],
            "source_chunks": [],
        }
        mock_get_orchestrator.return_value = mock_orchestrator

        client = TestClient(app)
        response = client.post("/api/knowledge/ask", json={
            "question": "Is this working?",
            "chat_config": {
                "provider": "anthropic",
                "apiKey": "sk-ant-test",
                "baseUrl": "https://api.anthropic.com",
                "model": "claude-sonnet-4-20250514",
            },
        })

        assert response.status_code == 200
        mock_get_orchestrator.assert_called_once()
        call_kwargs = mock_get_orchestrator.call_args
        assert call_kwargs[0][0] is not None  # chat_config

    @patch("backend.api.knowledge.get_orchestrator")
    def test_ask_passes_collection_names_to_orchestrator(self, mock_get_orchestrator):
        from backend.main import app

        mock_orchestrator = MagicMock()
        mock_orchestrator.route_task.return_value = {
            "answer": "Yes.",
            "source_doc_ids": ["doc-1"],
            "source_chunks": ["chunk"],
        }
        mock_get_orchestrator.return_value = mock_orchestrator

        client = TestClient(app)
        response = client.post("/api/knowledge/ask", json={
            "question": "这篇论文贡献是什么？",
            "knowledge_base_id": "kb-1",
            "mentioned_doc_ids": ["doc-1"],
            "doc_ids": ["doc-1"],
            "collection_names": ["documents__configured"],
        })

        assert response.status_code == 200
        route_kwargs = mock_orchestrator.route_task.call_args.kwargs
        assert route_kwargs["mentioned_doc_ids"] == ["doc-1"]
        assert route_kwargs["doc_ids"] == ["doc-1"]
        assert route_kwargs["collection_names"] == ["documents__configured"]

    @patch("backend.api.knowledge.get_orchestrator")
    def test_ask_returns_evidence_status(self, mock_get_orchestrator):
        from backend.main import app

        mock_orchestrator = MagicMock()
        mock_orchestrator.route_task.return_value = {
            "answer": "Yes.",
            "source_doc_ids": ["doc-1"],
            "source_chunks": ["chunk"],
            "evidence_status": "reliable",
        }
        mock_get_orchestrator.return_value = mock_orchestrator

        client = TestClient(app)
        response = client.post("/api/knowledge/ask", json={
            "question": "这篇论文贡献是什么？",
        })

        assert response.status_code == 200
        assert response.json()["evidence_status"] == "reliable"


# ── BaseAgent with provider ──────────────────────────────────────────────────


class TestBaseAgentProvider:
    def test_agent_uses_provider_directly(self):
        from backend.agents.literature import LiteratureParserAgent

        mock_provider = MagicMock()
        mock_provider.chat.return_value = "Agent result"

        agent = LiteratureParserAgent(model="test-model", provider=mock_provider)
        # Trigger _get_provider to verify it uses the injected provider
        provider = agent._get_provider()
        assert provider is mock_provider

    def test_agent_creates_provider_from_factory_when_none(self):
        from backend.agents.literature import LiteratureParserAgent

        agent = LiteratureParserAgent(
            model="test-model",
            api_key="sk-test",
            base_url="https://api.anthropic.com",
        )
        # _get_provider should create via factory
        with patch("backend.core.providers.factory.create_chat_provider") as mock_factory:
            mock_factory.return_value = MagicMock()
            provider = agent._get_provider()
            assert provider is not None
            mock_factory.assert_called_once()


# ── QA conversation history robustness ───────────────────────────────────────


class TestQAConversationHistory:
    def test_history_with_missing_role_does_not_crash(self):
        mock_provider = MagicMock()
        mock_provider.chat.return_value = "answer"
        agent = QAAgent(model="test", provider=mock_provider)

        history = [{"content": "hello"}, {"role": "user", "content": "hi"}]
        # Should not raise KeyError
        agent.run(
            document_context="doc",
            analysis_report="report",
            question="q",
            conversation_history=history,
        )

    def test_history_with_missing_content_does_not_crash(self):
        mock_provider = MagicMock()
        mock_provider.chat.return_value = "answer"
        agent = QAAgent(model="test", provider=mock_provider)

        history = [{"role": "user"}, {"role": "assistant", "content": "hi"}]
        # Should not raise KeyError
        agent.run(
            document_context="doc",
            analysis_report="report",
            question="q",
            conversation_history=history,
        )

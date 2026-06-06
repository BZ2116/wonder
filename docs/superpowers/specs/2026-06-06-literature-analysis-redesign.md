# Literature Analysis Redesign

## Goal

Redesign Wonder's single-document literature analysis so the result helps the user decide whether a paper is worth attention, how it relates to the current research direction or knowledge base, and what concrete action to take next.

The selected direction is a target-oriented analysis pipeline with light evidence weighting. The analysis should prioritize decision quality over generic note volume.

## Current Problems

The current analysis pipeline is:

1. Split raw text into fixed character chunks.
2. Run `LiteratureParserAgent` on each chunk.
3. Merge chunk summaries into a generic reading card.
4. Run relation, writing, and todo agents from that reading card.
5. Render all sections in the frontend.

This creates useful archival notes, but weak research decisions:

- The first extraction pass is not guided by the user's research goal or knowledge base context.
- Later agents depend on a generic reading card, so they amplify generic summaries instead of focusing on what matters.
- The output does not force a clear verdict such as deep read, skim, ignore, or collect.
- Knowledge-base relation is compressed into one score and a markdown section.
- The frontend shows detailed material before the key decision, which hides the useful part.
- Several Chinese prompt strings and UI labels are mojibake, which can confuse model instructions and reduce user trust.

## Non-Goals

- Do not replace the current PDF parser or add a new parsing dependency.
- Do not build a full source-citation UI in this iteration.
- Do not redesign knowledge QA, RAG retrieval, citation graph, or discovery flows.
- Do not rewrite persistence beyond the fields needed to store and replay the new analysis shape.

## Design Principles

- Lead with judgment. The first screen should answer "Should I spend time on this paper?"
- Make the user's research context a first-class input during extraction, not only after summarization.
- Separate evidence signals from final prose so downstream agents work from structured facts.
- Treat section information as a weighting hint when available, and degrade gracefully to chunk indices when unavailable.
- Keep backward compatibility with old analysis history.
- Keep the implementation small enough to verify with focused contract and rendering tests.

## New Analysis Flow

The new flow is:

```text
raw document text
  -> chunk_text()
  -> LiteratureParserAgent focused extraction
  -> decision brief merge
  -> ProjectRelationAgent decision/relation JSON
  -> WritingAgent and TodoAgent derive materials from the decision brief
  -> frontend decision-first rendering
```

### Focused Extraction

`LiteratureParserAgent` should receive both text chunks and research context. For each chunk it should extract structured signals instead of generic prose:

- `key_claims`
- `method_signals`
- `result_signals`
- `novelty_signals`
- `overlap_signals`
- `conflict_or_risk_signals`
- `reuse_signals`
- `missing_or_uncertain`

Each signal should include:

- `text`: concise Chinese statement.
- `signal_type`: one of the categories above.
- `section_type`: best known section type, or `unknown`.
- `chunk_index`: zero-based chunk index.
- `evidence_hint`: short phrase from the source content, without long quotation.

If structured section metadata is unavailable, `section_type` can remain `unknown`. The model should still avoid treating references as evidence when the chunk clearly contains a bibliography.

### Decision Brief

The final analysis result should add a top-level `decision_brief` object:

```json
{
  "verdict": "deep_read",
  "confidence": 78,
  "best_use": "method_reference",
  "why_it_matters": [
    "The method design can serve as a comparison point for the current direction.",
    "The evaluation metrics are close to the existing knowledge base's evaluation style."
  ],
  "key_takeaways": [
    "The paper proposes a reusable model structure.",
    "The experiment section provides a useful combination of metrics."
  ],
  "novelty_points": [
    "Compared with existing materials, it adds system-level method design details."
  ],
  "overlap_points": [
    "The research problem partially overlaps with papers already in the knowledge base."
  ],
  "conflict_or_risk_points": [
    "The paper lacks enough ablation evidence, so reuse should be validated first."
  ],
  "next_action": "Deep-read the method and experiment sections, then record reusable evaluation metrics."
}
```

Allowed `verdict` values:

- `must_read`: directly useful and should be read soon.
- `deep_read`: valuable, but requires selective deep reading.
- `skim`: partially useful, skim and record only selected points.
- `ignore`: low value for the current research direction.

Allowed `best_use` values:

- `literature_review`
- `method_reference`
- `experiment_baseline`
- `background`
- `not_useful`

### Relation And Scoring

`ProjectRelationAgent` should continue returning JSON, but should make the relation decision more decomposed:

- `fit_score`: overall relevance, 0-100.
- `knowledge_increment_score`: how much new value this adds beyond the known context, 0-100.
- `evidence_strength_score`: how well the useful claims are supported by methods, experiments, or conclusions, 0-100.
- `actionability_score`: how concrete the next step is, 0-100.
- `relation_type`: existing enum.
- `recommended_action`: mapped from the decision brief verdict.
- `suggested_placement`: sub-direction and tags.
- `novelty_for_kb`: concise markdown.
- `readme_suggestions`: 0-3 supported suggestions.
- `analysis`: markdown relation details.

The agent should not exaggerate relevance. A paper with a matching topic but no knowledge increment should score lower than a paper that adds a reusable method, conflict, or baseline.

### Derived Materials

`WritingAgent` and `TodoAgent` should receive the decision brief and relation analysis in addition to the reading card.

Writing materials should emphasize the selected `best_use`. For example:

- `literature_review`: summarize positioning and contribution language.
- `method_reference`: extract reusable method description and adaptation cautions.
- `experiment_baseline`: highlight datasets, metrics, baselines, and evaluation gaps.
- `background`: keep output concise.
- `not_useful`: avoid inventing writing value.

Todo generation should follow the verdict:

- `must_read`: produce immediate deep-read and extraction tasks.
- `deep_read`: produce selective reading and validation tasks.
- `skim`: produce short recording tasks only.
- `ignore`: produce no heavy follow-up tasks, only an optional archive note.

## Frontend Presentation

`AnalysisResult` should render the new shape in this order:

1. Paper title and file name.
2. Decision card with verdict, confidence, best use, why it matters, and next action.
3. Knowledge relation card with relevance, knowledge increment, evidence strength, actionability, relation type, placement, novelty, overlap, and risks.
4. Key takeaways and reusable points.
5. Reading card.
6. Writing assets/materials.
7. Todo list.
8. README suggestions.

Old records should still render with the existing fields. If `decision_brief` is absent, the UI should derive a minimal display from `fit_score`, `recommended_action`, `fit_reason`, and `summary`.

## API And Data Contract

The Python gateway final payload should include:

- `decision_brief`
- `focused_signals`
- `knowledge_increment_score`
- `evidence_strength_score`
- `actionability_score`
- existing fields such as `reading_card`, `relation_analysis`, `writing_materials`, `todo_list`, `fit_score`, `recommended_action`, and `suggested_placement`

The Node analysis route should:

- Normalize the new fields from Python.
- Store both snake_case and camelCase variants in history for compatibility.
- Return camelCase fields to the frontend.

The frontend normalizer should support:

- New flat camelCase response from SSE.
- New flat snake_case history entries.
- Existing legacy records.

## Evidence Weighting

This iteration uses light evidence weighting:

- Method, experiment, result, discussion, and conclusion signals should be treated as stronger evidence than background-only signals.
- Reference-list chunks should not support paper claims.
- If section metadata is unavailable, the model should mention uncertainty instead of pretending the section is known.
- The UI does not need to show exact citations yet, but the data should preserve enough signal metadata to support future citations.

## Error Handling

- If a JSON-producing agent returns invalid JSON, the backend should return a conservative fallback object rather than breaking the page.
- Fallback decision should be `skim` when there is partial content and `ignore` only when there is no useful signal.
- Missing scores should not crash normalization or rendering.
- Existing analysis history must remain readable.

## Testing

Backend tests should cover:

- `LiteratureParserAgent` can parse valid focused JSON and falls back safely on invalid output.
- Python gateway complete event includes `decision_brief` and new scores.
- Node analysis route stores and returns new fields.
- Old gateway payloads still pass existing tests.

Frontend tests should cover:

- `normalizeAnalysisResult` maps new snake_case and camelCase fields.
- `AnalysisResult` renders a decision card when `decisionBrief` exists.
- Legacy results without `decisionBrief` still render.

## Implementation Notes

- Keep the current `chunk_text()` function for this iteration.
- Add small helper functions instead of large rewrites.
- Prefer typed contract expansion over ad hoc string parsing.
- Fix mojibake in files touched by the implementation when those strings affect prompts or visible analysis UI.
- Avoid broad UI redesign; only reorder and add focused sections needed for decision-first analysis.

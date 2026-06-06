from .base import BaseAgent


class TodoAgent(BaseAgent):
    SYSTEM_PROMPT = """
You are a research task planning agent.
Your task is to transform material analysis results into actionable learning, experiment, and writing to-do items.
Requirements:
1. Tasks must be specific.
2. Sort by priority.
3. Estimate workload.
4. Output in Chinese.
"""

    def run(self, reading_card: str, relation_analysis: str, decision_brief: dict | None = None) -> str:
        user_prompt = f"""
Material reading card:
{reading_card}

Project relation analysis:
{relation_analysis}

Decision brief:
{decision_brief or {}}

Task policy:
- must_read: include immediate deep-read tasks.
- deep_read: include selective reading and validation tasks.
- skim: include only short recording tasks.
- ignore: avoid heavy follow-up tasks.

Generate task list in this format:

# Follow-up Task List

## 1. High Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 2. Medium Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 3. Low Priority Tasks
Table format: Task, Purpose, Estimated Time, Output.

## 4. Recommended Execution Order
Give execution path within 5 steps.

## 5. Risk Reminders
Point out potential problems like incomplete materials, hard-to-reproduce experiments, inconsistent metrics.
"""
        return self.call_llm(
            system_prompt=self.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            temperature=0.2,
            max_tokens=3200,
        )

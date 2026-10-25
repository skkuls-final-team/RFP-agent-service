"""AI 호출 규칙: 재시도 횟수, 실패 메시지, 사실에 없는 숫자 버리기 (CR-07, CR-12)."""

import pytest

from rfp_agent.llm import tasks
from rfp_agent.llm.client import FAILURE_MESSAGE, MAX_RETRIES, LLMFailure, make_llm
from tests.conftest import FakeLLM


def test_no_key_means_no_llm():
    assert make_llm(None, "gemini-3.8-flash") is None


def test_retries_then_fails_with_message():
    llm = FakeLLM(fail=True)
    with pytest.raises(LLMFailure, match=FAILURE_MESSAGE):
        tasks.classify_document(llm, "a.docx", "first page")
    assert len(llm.prompts) == MAX_RETRIES + 1


class NumberLLM(FakeLLM):
    def generate_json(self, prompt, schema):
        return {"explanation": "허용 누설량이 연간 2 % 로 더 크다."}


def test_explanation_with_invented_number_is_dropped():
    facts = "파일 6 174행: 0.5 % 이내\n파일 6 278행: 1 % 이내"
    assert tasks.explain_risk(NumberLLM(), "VALUE_MISMATCH", facts, []) is None

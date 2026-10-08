import argparse
import asyncio
import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ValidationError

from app.llm import ExtractionFailed, ExtractionTimeout, ExtractionUnavailable, extract_case
from app.schemas import ClinicalCaseDraft

EXAMPLES_PATH = Path(__file__).with_name("examples.json")


def normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def score_draft(example: dict, raw: dict) -> dict:
    try:
        draft = ClinicalCaseDraft.model_validate(raw)
    except ValidationError:
        return {"schema_valid": False, "age_correct": False, "symptom_precision": 0.0,
                "symptom_recall": 0.0, "diagnosis_leaked": None}
    actual = {normalize(item) for item in draft.symptoms}
    expected = [{normalize(alias) for alias in aliases} for aliases in example["symptoms"]]
    recognized = sum(any(item in aliases for aliases in expected) for item in actual)
    covered = sum(bool(actual & aliases) for aliases in expected)
    public_text = normalize(" ".join([draft.title, draft.vignette, *draft.symptoms]))
    leaked = any(re.search(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", public_text)
                 for term in example["forbidden_terms"])
    return {"schema_valid": True, "age_correct": draft.age_years == example["age_years"],
            "symptom_precision": recognized / len(actual),
            "symptom_recall": covered / len(expected), "diagnosis_leaked": leaked}


async def evaluate(live: bool) -> dict:
    examples = json.loads(EXAMPLES_PATH.read_text(encoding="utf-8-sig"))
    results = []
    for example in examples:
        try:
            raw = ((await extract_case(example["source_text"])).model_dump()
                   if live else example["offline_draft"])
            result = score_draft(example, raw)
        except (ExtractionFailed, ExtractionTimeout, ExtractionUnavailable) as exc:
            result = score_draft(example, {})
            result["error"] = type(exc).__name__
        results.append({"id": example["id"], **result})
    total = len(results)
    return {
        "mode": "live_gemini" if live else "offline_fixture_self_check",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "model": os.getenv("GEMINI_MODEL") if live else None,
        "location": os.getenv("GOOGLE_CLOUD_LOCATION") if live else None,
        "case_count": total,
        "schema_validity": sum(row["schema_valid"] for row in results) / total,
        "age_accuracy": sum(row["age_correct"] for row in results) / total,
        "symptom_precision": sum(row["symptom_precision"] for row in results) / total,
        "symptom_recall": sum(row["symptom_recall"] for row in results) / total,
        "diagnosis_leak_count": sum(row["diagnosis_leaked"] is True for row in results),
        "results": results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate synthetic extraction; offline is a harness self-check only.")
    parser.add_argument("--live", action="store_true", help="Call Gemini using configured ADC credentials.")
    parser.add_argument("--output", type=Path, help="Write a JSON report without source text or model output.")
    args = parser.parse_args()
    report = asyncio.run(evaluate(args.live))
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    if (report["schema_validity"] < 1 or report["age_accuracy"] < 1
            or report["symptom_precision"] < 0.8 or report["symptom_recall"] < 0.8
            or report["diagnosis_leak_count"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()

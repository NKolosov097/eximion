"""Read back actual OTLP spans through the linked Cloud Trace BigQuery dataset."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
import time

import httpx

from deploy import find_gcloud

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "eximion-511003"


def main():
    browser = json.loads((ROOT / "docs/cloud-browser-check.json").read_text(encoding="utf-8"))
    traces = browser["trace_ids"]
    assert traces, "Run the cloud browser check first."
    token = subprocess.check_output([find_gcloud(), "auth", "print-access-token"], text=True).strip()
    query = """SELECT TO_JSON_STRING(t) AS span
FROM `eximion-511003.eximion_trace._AllSpans` AS t
WHERE trace_id IN UNNEST(@trace_ids)
AND start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
LIMIT 500"""
    body = {
        "query": query, "useLegacySql": False, "location": "europe-west3",
        "maximumBytesBilled": "100000000", "timeoutMs": 10000,
        "parameterMode": "NAMED", "queryParameters": [{
            "name": "trace_ids", "parameterType": {"type": "ARRAY", "arrayType": {"type": "STRING"}},
            "parameterValue": {"arrayValues": [{"value": item["trace_id"]} for item in traces]},
        }],
    }
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, timeout=30) as client:
        response = client.post(f"https://bigquery.googleapis.com/bigquery/v2/projects/{PROJECT}/queries", json=body)
        response.raise_for_status()
        result = response.json()
        for _ in range(10):
            if result.get("jobComplete"):
                break
            time.sleep(1)
            response = client.get(f"https://bigquery.googleapis.com/bigquery/v2/projects/{PROJECT}/queries/{result['jobReference']['jobId']}", params={"location": "europe-west3", "timeoutMs": 1000})
            response.raise_for_status()
            result = response.json()
        assert result.get("jobComplete"), "Trace query is still running."
        assert not result.get("errors"), "Trace query failed."
        spans = [json.loads(row["f"][0]["v"]) for row in result.get("rows", [])]
        trace_filter = " OR ".join(f'trace="projects/{PROJECT}/traces/{item["trace_id"]}"' for item in traces)
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        log_query = {
            "resourceNames": [f"projects/{PROJECT}"],
            "filter": f'resource.type="cloud_run_revision" AND timestamp>="{since}" AND jsonPayload.event="operation.completed" AND ({trace_filter})',
            "pageSize": 1000,
        }
        logs = []
        for _ in range(10):
            response = client.post("https://logging.googleapis.com/v2/entries:list", json=log_query)
            response.raise_for_status()
            page = response.json()
            logs.extend(page.get("entries", []))
            if not page.get("nextPageToken"):
                break
            log_query["pageToken"] = page["nextPageToken"]
        assert not page.get("nextPageToken"), "Log query exceeded its page limit."
    encoded = (json.dumps(spans) + json.dumps(logs)).lower()
    private = json.loads((ROOT / ".local/cloud-secrets.json").read_text(encoding="utf-8"))
    for forbidden in (private["author_api_key"], private["db_password"], "influenza", "unrelated diagnosis", "sudden fever", "source_text", "db.statement", "db.query.text"):
        assert forbidden.lower() not in encoded, "Sensitive content found in stored telemetry."
    report = []
    for item in traces:
        found = [span for span in spans if span["trace_id"] == item["trace_id"]]
        names = {span["name"] for span in found}
        assert found, f"Stored spans not found yet for {item['trace_id']}."
        if item["path"].endswith("/extract"):
            expected = {"case.extract", "gemini.request", "gemini.output.validate"}
        elif item["path"].endswith("/attempts"):
            expected = {"case.attempt", "diagnosis.grade", "db.query", "db.transaction"}
        elif item["path"].endswith("/clinical-cases"):
            expected = {"case.create", "db.query", "db.transaction"}
        else:
            expected = {"case.read", "case.load", "db.query"}
        assert expected <= names, f"Missing operations: {expected - names}"
        span_ids = {span["span_id"] for span in found}
        logged_span_ids = {entry.get("spanId") for entry in logs if entry.get("trace", "").endswith(item["trace_id"])}
        assert span_ids <= logged_span_ids, "Stored spans lack correlated operational logs."
        for span in found:
            if not span["name"].startswith(("GET ", "POST ")):
                assert span.get("parent_span_id") in span_ids, "Broken application span parentage."
        report.append({"trace_id": item["trace_id"], "span_count": len(found), "correlated_log_count": len(logged_span_ids), "operations": sorted(names)})
    evidence = {"status": "passed", "source": "stored_otlp_spans_bigquery_link", "region": "europe-west3", "sensitive_content_absent": True, "traces": report, "bytes_processed": result.get("totalBytesProcessed")}
    (ROOT / "docs/cloud-trace-check.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()

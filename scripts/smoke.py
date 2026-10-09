"""Exercise a running deployment with synthetic data; no provider fallback."""
import argparse
import json
import os
import urllib.error
import urllib.request


def request(base, path, body=None, key=None):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["X-Author-Key"] = key
    req = urllib.request.Request(base.rstrip("/") + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.status, json.load(response)


def run(base, live):
    key = os.environ.get("AUTHOR_API_KEY", "local-author-key")
    assert request(base, "/ready")[0] == 200
    payload = {"title": "Synthetic smoke case", "vignette": "A 28-year-old has fever, a dry cough and fatigue for two days.", "symptoms": ["Fever", "Dry cough", "Fatigue"], "age_years": 28}
    if live:
        status, extracted = request(base, "/api/v1/clinical-cases/extract", {"source_text": payload["vignette"]}, key)
        assert status == 200 and extracted["warnings"]
        payload = extracted["draft"]
        assert "reference_diagnosis" not in payload
    payload.update(reference_diagnosis="Influenza", accepted_answers=["Flu"], guest_acknowledged=True)
    status, case = request(base, "/api/v1/clinical-cases", payload, key)
    assert status == 201
    path = "/api/v1/clinical-cases/" + case["id"]
    fetched = request(base, path)[1]
    assert fetched == case
    assert not {"reference_diagnosis", "accepted_answers", "source_text", "normalized_reference_diagnosis"}.intersection(fetched)
    for diagnosis, score in [("  FLU  ", 100), ("Unrelated diagnosis", 0)]:
        status, result = request(base, path + "/attempts", {"diagnosis": diagnosis, "guest_acknowledged": True})
        assert status == 201 and result["score"] == score and result["is_correct"] == (score == 100)
    try:
        request(base, "/api/v1/clinical-cases", payload, "invalid-key")
    except urllib.error.HTTPError as error:
        assert error.code == 401
    else:
        raise AssertionError("Author endpoints must reject invalid keys")
    print(json.dumps({"status": "passed", "live_extraction": live, "clinical_case_id": case["id"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--live", action="store_true")
    args = parser.parse_args()
    run(args.base_url, args.live)

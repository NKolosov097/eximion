# Runtime and dependency decisions

Inspected 2026-10-07. Node 24.19.0 and Python 3.12.13 are installed. Next 16.4.0 declares compatibility with React 19; React 19.3.0 is selected. TypeScript 5.9.3 is used rather than introducing a new compiler major during the exercise. Python and frontend package resolutions are pinned in uv.lock and package-lock.json; repeat installation uses frozen/ci mode.

Sources:
- https://nextjs.org/docs/app/getting-started/installation
- https://fastapi.tiangolo.com/release-notes/
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output
- https://docs.cloud.google.com/sql/docs/postgres/connect-run

The Google documentation now calls the managed generative model service Gemini Enterprise Agent Platform (formerly Vertex AI). Use Google Gen AI SDK and workload credentials. Model ID and location must be configured and verified with a live call before deployment is declared complete; no silent fallback to another provider or invented output.

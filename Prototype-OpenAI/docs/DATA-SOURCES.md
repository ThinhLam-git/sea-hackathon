# v2.2 source mapping

Source: [HACKATHON-CODEX on Google Drive](https://drive.google.com/drive/folders/1QY7Qto0DnRzALgPabY-lTsgzu2DQGGyB), downloaded October 31, 2026. All eight original files and a SHA-256 manifest are retained in the workspace's `reference-docs/HACKATHON-CODEX/` directory. Original documents are not published as site assets.

| Source | App use |
|---|---|
| Database model/Order_Rescue_Data_Model_30_Cases_v2.2.json | Authoritative synthetic raw seed, six-field assessment vocabulary and two-slot runtime contract; imported as `fixtures/v2/seed.json`. |
| Test case/Order_Rescue_Test_Cases_30_v2.2.json | Isolated evaluator expectations, hand-authored Replay assessments and manually released demo responses. Labels remain draft. |
| Test case/Order_Rescue_Minimal_Simulation_30_Cases_v2.1.xlsx | Companion source workbook referenced by the paired v2.2 JSON files. The app consumes the explicit JSON contract, rather than mixing spreadsheet v2.1 labels into it. |
| Policy gate/policy_rules_simple_v2.xlsx | Boundary/safety guidance and provenance. Its proposed parameters/public references do not silently replace the selected demo policy profile. |
| Order_Rescue_Product_Vision.docx | Operations audience; evidence-first recommendations and human authority. |
| Order_Rescue_Software_Architecture_Document.docx | Strict six-field assessment, raw input projection, one question, two assessment slots and one immutable final selection. |
| IDEA-SUMMARY.pdf | Background reference retained locally. |
| IDEA-AI-ANALYSIS.pdf | Background reference retained locally. |

## Precedence and compatibility

The user selected the 30-case v2.2 contract. Its specific manual `USER_NO_REPLY` transition supersedes older four-hour timeout and broad event-reassessment proposals. No-reply copies initial assessment/policy exactly, leaves after-reply null and records final source 1. A matching reply runs the second assessment, then selects source 2. Both outcomes close the case and reject later conflicting transitions.

The supplied nine-table schema remains the logical input contract in the immutable seed. This MVP reuses D1 session/audit storage for mutable state instead of adding an operational nine-table backend. This keeps the requested lightweight scope while preserving input projection, two slots and atomic final selection.

Older v0.5 code, 25-case fixtures and stored runs remain intact. The v2 API rejects mutation of legacy sessions; the client starts a fresh v2-compatible session. Redeploy saved Site version 4 to roll back the active API/UI without rewriting existing rows.

## Integrity and isolation

`fixtures/v2/provenance.json` records the paired-source SHA-256 hashes, count, contract, synthetic flag and draft status. `scripts/import-v2.mjs` checks the pairing, 30 unique cases, empty seed output slots and T0-only seed references before generating derived files.

The raw projection module never imports evaluator outputs. Live AI sees only seven core fields, known sources, current question and released interactions. Scoring excludes assessor self-confidence. No private source download URLs, credentials or raw chain of thought are stored in the app.

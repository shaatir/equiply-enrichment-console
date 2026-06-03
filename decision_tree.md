# Equiply Enrichment Pipeline — Decision Tree & Parsing Logic

This document details the step-by-step decision trees used to process, clean, and enrich raw hospital equipment logs. It explains the logical conditions, regex matches, and backup systems in place for every row.

> [!TIP]
> **Interactive View**: You can open the beautifully styled [decision_tree.html](file:///Users/ruchirjoshi/Projects/equiply-enrichment-console/decision_tree.html) directly in any web browser to view these flowcharts as an interactive tabbed dashboard with smooth transitions.

---

## 🗺️ End-to-End System Flowchart

Here is the global data flow showing how a CSV file goes from ingestion, through local rules-based parsing, automatic AI review, sorting, and final export.

```mermaid
flowchart TD
    Start(["User Ingests CSV File"]) --> Norm["Normalize Row Headers and Strings"]
    Norm --> Manufacturer["Resolve Manufacturer<br/>Input vs Prefix Lookup"]
    Manufacturer --> Date["Derive Manufactured Date<br/>Heuristics vs Fallbacks"]
    Date --> Device["Derive Device Type<br/>DEVICE_RULES regex matching"]
    Device --> Audit{"buildReviewReasons:<br/>Does row have anomalies?"}
    
    Audit -- Yes --> Flag["needs_review = true<br/>enrichment_mode = 'ai_review'"]
    Flag --> AutoTrigger["Frontend automatically calls /api/enrich-ai"]
    AutoTrigger --> AILayer["Backend Batch Queue<br/>Resolves via OpenAI JSON Schema"]
    AILayer --> Merge["mergeAiResolution:<br/>Override parameters, set needs_review = false"]
    
    Audit -- No --> RuleOnly["needs_review = false<br/>enrichment_mode = 'rule'"]
    
    RuleOnly --> Sort["Sort records ascending by date"]
    Merge --> Sort
    
    Sort --> UI["Display Table & Render Pie Chart"]
    UI --> Export["User exports to enriched.csv"]
```

---

## 1. Manufacturer Identification

### Decision Flowchart
```mermaid
graph TD
    Start(["Row Ingested"]) --> CheckInput{"Does row contain a<br/>Manufacturer name?"}
    
    CheckInput -- Yes --> UseInput["Use input manufacturer<br/>manufacturer_source = 'input'"]
    CheckInput -- No --> CheckPrefix{"Does the serial number<br/>start with a known abbreviation?"}
    
    CheckPrefix -- Yes --> MapLookup["Resolve name using lookup dictionary<br/>manufacturer_source = 'serial_prefix'"]
    CheckPrefix -- No --> MarkMissing["Set manufacturer to empty string<br/>manufacturer_source = 'missing'"]
    
    UseInput --> Finish(["Manufacturer Resolved"])
    MapLookup --> Finish
    MarkMissing --> Finish
```

### Logical Breakdown
1.  **Step 1: Check Input**: The system first inspects the `manufacturer` column. If a non-empty name exists, it sanitizes/trims the string and tags `manufacturer_source` as `'input'`.
2.  **Step 2: Prefix Matching**: If the manufacturer is blank, it splits the serial number by spaces, hyphens, or underscores and checks the first word (the prefix) against `MANUFACTURER_PREFIXES` in [enricher.js](file:///Users/ruchirjoshi/Projects/equiply-enrichment-console/src/utils/enricher.js#L31):
    *   `ge` $\rightarrow$ **GE Healthcare**
    *   `philips` or `ph` $\rightarrow$ **Philips**
    *   `siemens` or `sie` $\rightarrow$ **Siemens Healthineers**
    *   `mdt` $\rightarrow$ **Medtronic**
    *   `bax` $\rightarrow$ **Baxter**
3.  **Step 3: Missing**: If both checks fail, the manufacturer is set to empty and flagged as `'missing'`.

#### 📝 Examples:
*   `"GE Healthcare", "Voluson E8"` $\rightarrow$ **GE Healthcare** (Source: `input`)
*   `"", "spect-iq", "bax-901842"` $\rightarrow$ **Baxter** (Source: `serial_prefix` - matched `bax` prefix)

---

## 2. Date of Manufacture Derivation

This stage executes the `deriveManufacturedDate` function in [enricher.js](file:///Users/ruchirjoshi/Projects/equiply-enrichment-console/src/utils/enricher.js#L141).

### Decision Flowchart
```mermaid
graph TD
    Start(["Manufacturer and Serial Normalized"]) --> IsBrandKnown{"Is the resolved<br/>manufacturer known?"}
    
    IsBrandKnown -- Yes --> MatchBrandRule{"Does serial fit a known<br/>brand barcode format?<br/>e.g., Zoll, Edan, Hillrom, ADC"}
    MatchBrandRule -- Yes --> ExtractBrandDate["Extract date from barcode<br/>source = 'manufacturer_rule:brand'"]
    
    IsBrandKnown -- No --> CheckExplicit{"Does serial contain an<br/>explicit date? YYYY-MM-DD"}
    MatchBrandRule -- No --> CheckExplicit
    
    CheckExplicit -- Yes --> ExtractExplicit["Extract full date<br/>source = 'generic:explicit_date'"]
    CheckExplicit -- No --> CheckYearMonth{"Does serial contain<br/>Year-Month? YYYY-MM"}
    
    CheckYearMonth -- Yes --> ExtractYearMonth["Extract YYYY-MM-01<br/>source = 'generic:year_month'"]
    CheckYearMonth -- No --> CheckLetterYear{"Does serial start with<br/>Letter + 2-Digit Year?"}
    
    CheckLetterYear -- Yes --> ExtractLetterYear["Convert to YYYY-01-01<br/>source = 'generic:two_digit_year_after_letter'"]
    CheckLetterYear -- No --> CheckOtherPatterns{"Does serial match other year formats?<br/>e.g., YY at start, 4-Digit year"}
    
    CheckOtherPatterns -- Yes --> ExtractOtherYear["Extract YYYY-01-01<br/>source = 'generic:pattern'"]
    CheckOtherPatterns -- No --> CheckBrandDefault{"Does brand have a<br/>conservative default date?<br/>e.g., Philips = 2018, GE = 2015"}
    
    CheckBrandDefault -- Yes --> ApplyBrandDefault["Apply default date<br/>source = 'manufacturer_default:brand'"]
    CheckBrandDefault -- No --> IndexFallback["Calculate index-based year:<br/>2016 + index mod 9<br/>source = 'fallback:index'"]
```

### Logical Breakdown
1.  **Manufacturer-Specific Rules**: If the manufacturer matches a known brand, the parser looks for proprietary serial patterns:
    *   *Edan*: Matches `M` + 2-digit year (e.g. `M19` $\rightarrow$ `2019-01-01`).
    *   *Zoll*: Matches letters + 2-digit year + letter A-L for month (e.g. `T14B...` $\rightarrow$ `2014-02-01`).
    *   *Hill-Rom*: Looks for ending year strings `1998`/`1999`, or model checks (e.g., `Century` model defaults to `1999`, `P1440` to `2016`).
    *   *American Diagnostic*: Matches starting 2 digits as a year (e.g. `C15...` $\rightarrow$ `2015-01-01`).
    *   *BioSonic / Cogentix*: Matches 2-digit year + 2-digit month.
2.  **Generic Fallback Rules**: If no manufacturer matches, the script falls back to parsing common date formats:
    *   *Explicit Date*: Matches strings like `2021-05-15` or `20210515`.
    *   *Year-Month*: Matches `2021-05` (defaults day to `01`).
    *   *Year-Only Patterns*: Extracts any 4-digit numbers starting with `19` or `20`.
3.  **Default & Fallback Strategy**:
    *   *Manufacturer Average*: If no date is found but the brand is known, it applies a default brand average (e.g. Philips $\rightarrow$ `2018-01-01`).
    *   *Deterministic Year Index*: If no data exists, it applies `2016 + (index % 9)` to yield a mock date so the records can still sort.

---

## 3. Device Type Classification

### Decision Flowchart
```mermaid
graph TD
    Start(["Aggregate Search Text"]) --> BuildSearch["Join manufacturer, model, and serial into search string"]
    BuildSearch --> CheckRules{"Scan DEVICE_RULES sequentially:<br/>Does a regex pattern match?"}
    
    CheckRules -- Yes --> MatchType["Assign matching category<br/>source = matching category name"]
    CheckRules -- No --> MarkUnknown["Assign 'Unknown Device'<br/>source = 'unknown'"]
    
    MatchType --> Finish(["Device Type Derived"])
    MarkUnknown --> Finish
```

### Logical Breakdown
1.  **Search Text Assembly**: The system joins the manufacturer name, model number, and serial number (lowercase) to create a single string.
2.  **Sequential Regex Scanning**: It loops through `DEVICE_RULES` in [enricher.js](file:///Users/ruchirjoshi/Projects/equiply-enrichment-console/src/utils/enricher.js#L1) and executes regex matches:
    *   *Example: Ventilator* $\rightarrow$ checks for `vent`, `puritan`, `respir`, `servo`
    *   *Example: Ultrasound* $\rightarrow$ checks for `ultra`, `voluson`, `logiq`, `epiq`
3.  **Boundary Protection**: Sensitive keywords are bounded by `\b` word anchors. E.g., the `X-Ray` rule utilizes `\brad\b` so it only flags standalone radiologic labels, preventing false positives like `Masimo RAD8` (which resolves as a `Pulse Oximeter`).

---

## 4. Anomaly Validation & AI Review Routing

### Decision Flowchart
```mermaid
graph TD
    Start(["Inspect Enriched Row"]) --> CheckAnomalies{"Does row contain any of:<br/>1. Missing/Unresolved Manufacturer<br/>2. Brand default or index fallback date<br/>3. Unknown Device Type<br/>4. Missing Serial Number?"}
    
    CheckAnomalies -- Yes --> SetReview["needs_review = true<br/>enrichment_mode = 'ai_review'"]
    CheckAnomalies -- No --> SetRule["needs_review = false<br/>enrichment_mode = 'rule'<br/>(Row Resolved)"]
    
    SetRule --> Finish(["Output Row"])
    
    SetReview --> AutoTrigger[Frontend automatically queues row for AI API]
    AutoTrigger --> ResolveAI[AI backend resolves details using JSON Schema]
    ResolveAI --> MergeResults[Merge updates into row<br/>source = 'ai'<br/>needs_review = false<br/>enrichment_mode = 'ai']
    MergeResults --> Finish
```

### Logical Breakdown
1.  **Validation Check**: The rule engine reviews the output. If a row was assigned a default date, has an unknown type, or lacks a serial/manufacturer, it sets `needs_review: true`.
2.  **Automated AI Enrichment**:
    *   The frontend intercepts rows where `needs_review` is true and sends *only* those rows to the local proxy `/api/enrich-ai`.
    *   The backend queues and batches the records (groups of `10`) to perform a structured schema request to OpenAI.
    *   The LLM parses, identifies, and fills in the gaps.
3.  **Final Integration**: Enriched parameters are merged, setting `needs_review` to `false` and documenting the update source as `'ai'`.

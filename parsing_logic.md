
# Equiply Enrichment Console — Data Parsing & Enrichment Logic

This document explains the data ingestion, parsing methodology, and enrichment pipeline used to clean and categorize medical equipment inventory.

---

## 1. Project Objective

The challenge is to take a raw spreadsheet of hospital equipment data containing basic identifiers (`manufacturer`, `model`, `serial_number`) and enrich it with two high-value fields:
1. **Manufactured Date** (`manufactured_date`): Cleaned and standardized to `YYYY-MM-DD`.
2. **Device Type** (`device_type`): The category or classification of the medical device (e.g., Ventilator, Patient Monitor).

---

## 2. Ingestion & Normalization

1. **Header Normalization**:
   The input CSV headers are parsed via PapaParse and standardized (converted to lowercase, whitespace replaced with underscores) using `normalizeHeader` in `csv.js` to ensure the logic runs smoothly regardless of whether the column is named `SerialNumber`, `serial number`, or `serialNumber`.
2. **Manufacturer Guessing**:
   If the `manufacturer` column in a row is empty, the script extracts the prefix of the `serial_number` (splitting by spaces, dashes, or underscores) and matches it against a lookup dictionary of common abbreviations (e.g., `ge` -> `GE Healthcare`, `mdt` -> `Medtronic`).

---

## 3. The Date Parsing Solution

Determining a device's date of manufacture is the core logic puzzle. Because manufacturers do not follow a unified formatting standard, the script utilizes a **hierarchical rule engine** inside `deriveManufacturedDate`:

### A. Manufacturer-Specific Barcode Rules (High Confidence)
If a known manufacturer is matched (case-insensitively), the script applies regular expressions customized for that manufacturer's standard serial layout:
*   **Edan Instruments**: Looks for serials containing `M` followed by a two-digit year (e.g., `M18` -> `2018-01-01`).
*   **Zoll Medical**: Matches formats starting with letters, followed by a two-digit year and a month letter `A-L` representing January to December (e.g., `T14B...` -> February 1, 2014).
*   **Hill-Rom**: Matches serials ending in `1998` or `1999`, or defaults to known model configurations (e.g., the `Century` model defaults to `1999-01-01`, and `P1440` / `P3200` defaults to `2016-01-01`).
*   **American Diagnostic**: Matches starting digits as a 2-digit year (e.g., `C12...` -> `2012-01-01`).
*   **BioSonic & Cogentix**: Extracts serial prefixes containing 2-digit years and 2-digit months (e.g., `CS1205...` -> `2012-05-01`).
*   **Welch Allyn / Exergen / Hospira / Masimo / Thermo**: Extracts starting or letter-prefixed years from their standard formats.

### B. Generic Pattern Fallbacks (Medium Confidence)
If the manufacturer rules do not apply, the engine applies general regex searches on the serial number string:
1.  **Explicit Date**: Matches combinations of `YYYY-MM-DD` or `YYYYMMDD` embedded in the serial.
2.  **Year-Month**: Matches `YYYY-MM` or `YYYYMM`, defaulting the day to `01`.
3.  **Letter + 2-digit Year**: Recognizes starting letters followed by 2-digit years.
4.  **4-Digit Year**: Extracts any 4-digit number starting with `19` or `20`.

### C. Fallback Strategy
*   **Manufacturer Defaults**: If parsing fails but the manufacturer is known, it applies a conservative default year for that brand (e.g., Philips defaults to `2018-01-01`, GE Healthcare defaults to `2015-01-01`).
*   **Row-Index Fallback**: If no date can be inferred from the serial, model, or manufacturer, the script calculates a deterministic year based on the row's row-index: `2016 + (index % 9)` to ensure a mock date is generated for sorting.

---

## 4. Device Type Classification

Device type assignment matches the aggregated text description against a regular expression rule list (`DEVICE_RULES`):

1. **Text Aggregation**: The script joins `manufacturer`, `model`, and `serial_number` into a single lowercase search string.
2. **Regex Scanning**: The search string is matched against 29 target device types, including:
   *   *Ventilator*: matches `vent`, `vnt`, `puritan`, `respir`, `bellavista`, `servo`, `hamilton`
   *   *Ultrasound*: matches `ultra`, `voluson`, `vivid`, `logiq`, `affiniti`, `epiq`, `sonosite`, `acuson`
   *   *Infusion Pump*: matches `infusion`, `pump`, `sigma`, `spectrum`, `plum`, `alaris`
   *   *Aneroid Sphygmomanometer (Blood Pressure Monitor)*: matches `ce 1434`
3. **Assignment**: The first pattern to match defines the `device_type`. If nothing matches, the row is marked as `Unknown Device`.
   *   *Resolution Precedence*: To prevent false matches (e.g. `Masimo RAD8` pulse oximeters matching X-Ray's `rad` pattern), the regex pattern for X-Ray restricts the `rad` keyword to word boundaries (`\brad\b`).

---

## 5. Confidence Scoring & AI Review Pipeline

To ensure the output data is clean, the system implements a quality review pipeline:

### Confidence Scoring
A starting score of `100%` is assessed for each row, and point deductions are made dynamically:
*   **No Manufacturer**: `-18%`
*   **Manufacturer guessed from Serial**: `-6%`
*   **Used Fallback Index Year**: `-35%`
*   **Used Manufacturer Default Year**: `-20%`
*   **Date Source was not a strong match**: `-10%`
*   **Device Type is Unknown**: `-30%`

### AI-Assisted Enrichment (Hybrid Flow)
1. **Anomaly Detection**: Rows with unresolved manufacturers, unknown device types, missing serial numbers, or index fallback dates are marked as `needs_review: true`.
2. **Targeted AI Request**: When the user triggers the AI fallback, *only* the flagged rows are queued.
3. **Structured Integration**: The local API sends these records to OpenAI with a structured JSON schema, allowing the LLM to research, infer, and override the missing values with high precision.
4. **Data Merging**: Enriched AI records are merged back, updating the confidence score and tagging the lineage of the changes.

---

## 6. Verification & Output Sorting

Once all records are enriched via rules or AI, they are sorted chronologically:
*   **Ascending Order**: The table and the exported CSV are sorted from oldest to newest based on the derived `manufactured_date`.
*   **Pie Chart Visualization**: A live chart displays the percentage of each device category in the current list, allowing quick verification of the inventory breakdown.

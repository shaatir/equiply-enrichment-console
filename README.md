# Equiply Enrichment Console

A medical equipment inventory enrichment console built with React, Vite, and custom Node server middleware. This dashboard parses raw hospital equipment datasets (CSV files containing manufacturer, model, and serial number), standardizes metadata, and derives correct classifications and dates of manufacture using a hybrid deterministic-and-AI pipeline.

## 🚀 Features

*   **CSV File Ingestion**: Upload custom spreadsheet logs or load standard challenge datasets directly.
*   **Deterministic Parsing Heuristics**: Custom regular expression models match serial barcodes from major brands (Zoll, Hillrom, Edan, Welch Allyn, Covidien, Masimo, BioSonic, Cogentix, Hospira, Thermo) to derive dates instantly.
*   **Device Type Classification**: Automated string-matching regex rules classify devices into 29 clinical types.
*   **Quality & Confidence Audit**: Tracks extraction lineage (`input`, `serial_prefix`, `ai`, etc.) and scores confidence from `40%` to `100%`.
*   **Targeted AI Fallback (Hybrid Flow)**: Ambiguous rows that fail heuristic parsing are flagged for review and solved asynchronously using an OpenAI Structured Outputs backend.
*   **Analytics Visualization**: Renders distribution mix of device categories in real-time.
*   **Data Export**: Downloads a sorted, fully enriched CSV matching hackathon submission requirements.

---

## 🛠️ Setup & Installation

### 1. Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (version 18 or higher) and `npm` installed.

### 2. Install Dependencies
Clone the repository, navigate to the folder, and run:
```bash
npm install
```

### 3. Configure the Environment
Create a `.env` file at the root of the project to add your OpenAI API key:
```ini
OPENAI_API_KEY=your-api-key-here
```

---

## 💻 Running the Application

### Start the Development Server
To launch both the React frontend and the backend API middleware, run:
```bash
npm run dev
```

Once running, navigate to:
*   **Local**: [http://localhost:5173/](http://localhost:5173/)
*   **Network**: http://192.168.2.106:5173/

---

## 🔧 Command Line Utility

You can also run the enrichment logic directly on a local CSV file using the Node CLI script. It reads `challenge_data-v1.csv` and outputs `enriched.csv`.

Run the script:
```bash
node --env-file=.env scripts/enrich-with-openai.mjs
```

---

## 📐 How the Enrichment Rules Work

The console runs a **three-stage evaluation**:

1.  **Normalization**: Trim fields and standardize keys (e.g. `SerialNumber` -> `serial_number`).
2.  **Date Matching Heuristics**: Runs the serial code through manufacturer patterns (e.g. Zoll's `[Letters][2-Digit Year][Month Letter]` format, Edan's `M[2-Digit Year]` format).
3.  **Device Classification**: Joins manufacturer, model, and serial metadata to scan against regular expressions representing standard categories (e.g. matches `puritan` to `Ventilator`, `voluson` to `Ultrasound`).
4.  **AI Fallback**: If a row has an unresolved manufacturer, unknown device type, or missing serial, the app flags it for review (`needs_review: true`) and passes only those ambiguous rows to the LLM backend for structured resolution.

---

## 📺 Demonstration Video

Here is a walkthrough demonstration of the Equiply Enrichment Console, showcasing the parsing solutions, user interface elements, and the automated hybrid AI enrichment workflow in action:

![Walkthrough Video](explanation_video.mp4)

*(If the player does not load, you can download or watch the file directly here: [explanation_video.mp4](explanation_video.mp4))*

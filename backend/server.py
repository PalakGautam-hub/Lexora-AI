from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv
import os
import fitz  # PyMuPDF
import json
import re

load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.3-70b-versatile"


# ─────────── DOCUMENT PARSING ───────────

def extract_pdf_text(pdf_bytes):
    text = ""
    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page in pdf:
        text += page.get_text()
    return text


def parse_docx(file_bytes):
    try:
        import docx
        import io
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as e:
        return f"[DOCX parse error: {e}]"


def chunk_text(text, max_chars=12000):
    """Split text into chunks for large documents."""
    if len(text) <= max_chars:
        return [text]
    chunks = []
    while text:
        chunks.append(text[:max_chars])
        text = text[max_chars:]
    return chunks


def safe_json_parse(raw: str) -> dict:
    """Try to extract a JSON object from an LLM response string."""
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {}


def llm(messages, temperature=0.2):
    completion = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=temperature,
    )
    return completion.choices[0].message.content


# ─────────── /ask — Q&A ───────────

@app.route("/ask", methods=["POST"])
def ask():
    try:
        data = request.json
        question = data.get("question", "")
        documents = data.get("documents", [])

        combined_docs = ""
        for i, doc in enumerate(documents):
            text = doc.get("text", "")
            # Use up to 15000 chars per doc (vs old 6000 total)
            combined_docs += f"\n\nDocument {i+1}: {doc['name']}\n{text[:15000]}"

        prompt = f"""You are Lexora, an expert AI document assistant specializing in company documents, contracts, and reports.

Analyze ALL documents provided before answering. Give precise, well-structured answers.
Use bullet points and clear headings when appropriate.

Documents:
{combined_docs}

Question:
{question}"""

        answer = llm([{"role": "user", "content": prompt}])
        return jsonify({"answer": answer})

    except Exception as e:
        print("SERVER ERROR /ask:", e)
        return jsonify({"answer": f"Server error: {str(e)}"}), 500


# ─────────── /summarize — Structured Summary ───────────

@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        data = request.json
        documents = data.get("documents", [])

        results = []
        for doc in documents:
            text = doc.get("text", "")[:14000]
            name = doc.get("name", "Document")

            prompt = f"""You are an expert AI document assistant. Analyze this document and return a JSON summary.

Return ONLY valid JSON with these exact keys:
{{
  "executive_summary": "2-3 sentence plain-English overview",
  "document_type": "Contract / NDA / Invoice / Report / etc.",
  "parties": ["Party A", "Party B"],
  "effective_date": "date string or null",
  "expiry_date": "date string or null",
  "key_obligations": ["obligation 1", "obligation 2"],
  "key_deadlines": ["deadline 1"],
  "important_amounts": ["$X for Y", "..."],
  "red_flags": ["flag 1", "flag 2"]
}}

DOCUMENT ({name}):
{text}"""

            raw = llm([{"role": "user", "content": prompt}])
            parsed = safe_json_parse(raw)
            parsed["name"] = name
            results.append(parsed)

        return jsonify({"summaries": results})

    except Exception as e:
        print("SERVER ERROR /summarize:", e)
        return jsonify({"error": str(e)}), 500


# ─────────── /extract-clauses — Clause Extraction ───────────

@app.route("/extract-clauses", methods=["POST"])
def extract_clauses():
    try:
        data = request.json
        documents = data.get("documents", [])

        results = []
        for doc in documents:
            text = doc.get("text", "")[:14000]
            name = doc.get("name", "Document")

            prompt = f"""You are an expert document analyst. Extract key clauses and sections from the document below.

Return ONLY valid JSON:
{{
  "termination": "exact quoted text or null",
  "payment_terms": "exact quoted text or null",
  "liability": "exact quoted text or null",
  "confidentiality": "exact quoted text or null",
  "indemnification": "exact quoted text or null",
  "governing_law": "exact quoted text or null",
  "dispute_resolution": "exact quoted text or null",
  "intellectual_property": "exact quoted text or null",
  "force_majeure": "exact quoted text or null",
  "non_compete": "exact quoted text or null",
  "warranties": "exact quoted text or null",
  "amendments": "exact quoted text or null"
}}

Set a clause to null if it does not appear in the document.

DOCUMENT ({name}):
{text}"""

            raw = llm([{"role": "user", "content": prompt}])
            parsed = safe_json_parse(raw)
            parsed["name"] = name
            results.append(parsed)

        return jsonify({"clauses": results})

    except Exception as e:
        print("SERVER ERROR /extract-clauses:", e)
        return jsonify({"error": str(e)}), 500


# ─────────── /detect-risks — Risk Detection ───────────

@app.route("/detect-risks", methods=["POST"])
def detect_risks():
    try:
        data = request.json
        documents = data.get("documents", [])

        results = []
        for doc in documents:
            text = doc.get("text", "")[:14000]
            name = doc.get("name", "Document")

            prompt = f"""You are a senior risk and compliance analyst. Identify ALL risks, flagged items, or negative consequences in this document.

Return ONLY valid JSON:
{{
  "overall_risk": "HIGH" | "MEDIUM" | "LOW",
  "risk_score": <integer 0-100>,
  "risks": [
    {{
      "clause_type": "Termination / Liability / Payment / etc.",
      "excerpt": "short relevant quote from document",
      "risk_level": "HIGH" | "MEDIUM" | "LOW",
      "reason": "why this is a risk",
      "recommendation": "what the party should do"
    }}
  ],
  "positive_clauses": ["clause 1 that protects the party", "..."],
  "missing_standard_clauses": ["Force Majeure", "Dispute Resolution", "..."]
}}

Return at least 3 risks if they exist. Be specific and quote from the document.

DOCUMENT ({name}):
{text}"""

            raw = llm([{"role": "user", "content": prompt}])
            parsed = safe_json_parse(raw)
            parsed["name"] = name
            results.append(parsed)

        return jsonify({"risk_analysis": results})

    except Exception as e:
        print("SERVER ERROR /detect-risks:", e)
        return jsonify({"error": str(e)}), 500


# ─────────── /parse-file — Server-side file parsing ───────────

@app.route("/parse-file", methods=["POST"])
def parse_file():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        f = request.files["file"]
        filename = f.filename.lower()
        file_bytes = f.read()

        if filename.endswith(".pdf"):
            text = extract_pdf_text(file_bytes)
        elif filename.endswith(".docx"):
            text = parse_docx(file_bytes)
        else:
            text = file_bytes.decode("utf-8", errors="replace")

        return jsonify({"text": text, "name": f.filename, "chars": len(text)})

    except Exception as e:
        print("SERVER ERROR /parse-file:", e)
        return jsonify({"error": str(e)}), 500


# ─────────── /health ───────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
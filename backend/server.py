from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv
import os
import fitz  # PyMuPDF
import base64


load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def extract_pdf_text(pdf_bytes):
    text = ""
    pdf = fitz.open(stream=pdf_bytes, filetype="pdf")

    for page in pdf:
        text += page.get_text()

    return text


@app.route("/ask", methods=["POST"])
def ask():

    try:

        data = request.json

        question = data.get("question","")
        documents = data.get("documents",[])

        combined_docs=""

        for i,doc in enumerate(documents):
            combined_docs += f"\n\nDocument {i+1}: {doc['name']}\n{doc['text']}"

        prompt=f"""
You are an AI document assistant.

The user uploaded multiple documents.

Analyze ALL documents before answering.

Documents:
{combined_docs}

Question:
{question}
"""

        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role":"user","content":prompt[:6000]}
            ]
        )

        answer = completion.choices[0].message.content

        return jsonify({"answer":answer})

    except Exception as e:

        print("SERVER ERROR:",e)

        return jsonify({"answer":"Server error occurred"}),500


import os

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
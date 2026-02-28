from flask import Flask, request, send_file, jsonify
import base64
import tempfile
import os

app = Flask(__name__)

@app.route("/decode-pdf", methods=["POST"])
def decode_pdf():
    try:
        data = request.json.get("base64")
        if not data:
            return jsonify({"error": "No Base64 provided"}), 400

        clean_b64 = "".join(data.strip().split())

        pdf_bytes = base64.b64decode(clean_b64)

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        tmp.write(pdf_bytes)
        tmp.close()

        return send_file(tmp.name, mimetype="application/pdf")

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5000)

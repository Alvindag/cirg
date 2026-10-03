FROM python:3.12-slim

WORKDIR /app

COPY dashboard/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY dashboard/ .
# Reuse the collector's scoring/import logic so CSV uploads through the
# dashboard can trigger the same code path as the standalone CLI tools.
COPY collector/risk_engine.py collector/scanner_import.py collector/db.py ./lib/

EXPOSE 8081
CMD ["gunicorn", "--bind", "0.0.0.0:8081", "--workers", "2", "--timeout", "120", "app:app"]

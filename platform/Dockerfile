FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN useradd -r -u 10001 app && mkdir -p /data && chown app /data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
USER app
ENV ITAM_DB_PATH=/data/itam.db CYBERSHIELD_DB_PATH=/data/cybershield.db HUB_DB_PATH=/data/hub.db
CMD ["python", "-m", "waitress", "--listen=0.0.0.0:5080", "--call", "hub.wsgi:factory"]

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY collector/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY collector/ .
COPY squid/blocklists /app/blocklists-seed

RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]

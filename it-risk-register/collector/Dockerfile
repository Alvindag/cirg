FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nmap ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# vulners.nse isn't bundled with nmap — it's a community NSE script that
# queries vulners.com's CVE database using the CPEs nmap's -sV detects.
# Falls back to nmap's built-in "vuln" script category (offline, narrower
# coverage) if the download fails, e.g. no internet at build time.
RUN curl -fsSL https://raw.githubusercontent.com/vulnersCom/nmap-vulners/master/vulners.nse \
    -o /usr/share/nmap/scripts/vulners.nse \
    && nmap --script-updatedb \
    || echo "vulners.nse download failed — nmap_scanner.py will fall back to the 'vuln' script category only"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "run_collectors.py"]

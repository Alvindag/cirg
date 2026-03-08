# CIRG — Cyber Incident Report Generator

> Professional cyber incident reporting system compliant with **NIST SP 800-61 Rev.2**, **ACPO Good Practice Guide**, and **Ghana CSA Guidelines**.

![Version](https://img.shields.io/badge/version-1.0-gold)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![Framework](https://img.shields.io/badge/NIST-SP%20800--61-navy)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Overview

CIRG is a Flask-based web application that guides analysts through a structured 6-step incident reporting wizard. It integrates directly with **CFEMS** (Cyber Forensic Evidence Management System) to automatically pull digital evidence into professionally formatted PDF reports.

---

## Features

- 6-step guided incident creation wizard
- Auto-generates PDF reports with full evidence tables, response actions, and legal compliance sections
- Direct integration with CFEMS PostgreSQL database — evidence pulled automatically by case number
- SHA-256 hash verification per ISO/IEC 27037:2012
- NIST SP 800-61, ACPO, and Ghana CSA framework compliance
- Real-time online/offline status indicator
- Full incident history with versioned report archive

---

## Prerequisites

- Python 3.10+
- PostgreSQL 13+ (shared with CFEMS, database name: `cfems`)
- CFEMS running on port 5000

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/cirg.git
cd cirg

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and set your PostgreSQL password

# 4. Set up the database
psql -U postgres -d cfems -f database/cirg_schema.sql

# 5. Start the server (always from project root)
python backend/server.py
```

Open your browser at: **http://localhost:5001**

> ⚠️ **Important:** Always run from the project root folder, never from inside `backend/`.

---

## Project Structure

```
cirg/
├── backend/
│   ├── server.py        # Flask API server — all endpoints
│   ├── config.py        # Database and server configuration
│   └── pdf_builder.py   # Professional PDF report generator (ReportLab)
├── frontend/
│   └── CIRG_System.html # Single-file frontend (HTML/CSS/JS)
├── database/
│   └── cirg_schema.sql  # PostgreSQL schema for CIRG tables
├── reports/             # Generated PDF reports (git-ignored)
├── .env.example         # Environment variable template
├── requirements.txt     # Python dependencies
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `cfems` | Database name (shared with CFEMS) |
| `DB_USER` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | *(empty)* | PostgreSQL password |
| `CIRG_PORT` | `5001` | Flask server port |
| `FLASK_DEBUG` | `False` | Enable debug mode |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + incident count |
| `GET` | `/api/dashboard` | Dashboard stats + recent incidents |
| `GET` | `/api/incidents` | List all incidents |
| `POST` | `/api/incidents` | Create new incident |
| `GET` | `/api/incidents/:id` | Get incident with all related data |
| `PUT` | `/api/incidents/:id` | Update full incident |
| `PATCH` | `/api/incidents/:id/detection` | Update detection fields |
| `PATCH` | `/api/incidents/:id/cfems-link` | Link/unlink CFEMS case |
| `POST` | `/api/incidents/:id/actions` | Add response action |
| `POST` | `/api/incidents/:id/legals` | Add legal consideration |
| `POST` | `/api/incidents/:id/recommendations` | Add recommendation |
| `POST` | `/api/incidents/:id/generate-report` | Generate + download PDF report |
| `GET` | `/api/cfems/cases` | List CFEMS cases for dropdown |

---

## Compliance Frameworks

| Framework | Application |
|-----------|-------------|
| NIST SP 800-61 Rev.2 | 6-phase incident response lifecycle |
| ACPO Good Practice Guide | Digital evidence handling principles |
| Ghana CSA Guidelines | National incident reporting obligations |
| Ghana Data Protection Act 2012 | Data breach notification requirements |
| ISO/IEC 27037:2012 | SHA-256 evidence integrity verification |

---

## Integration with CFEMS

CIRG connects to the same PostgreSQL database as CFEMS. When an incident is linked to a CFEMS case number (e.g. `FS-2026-0314`), all evidence items — including SHA-256 hashes, analyst names, and device information — are automatically retrieved and included in the PDF report.

Both systems must be running simultaneously:
- CFEMS: `http://localhost:5000`
- CIRG: `http://localhost:5001`

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*CIRG v1.0 — Built for cyber incident response teams operating under NIST, ACPO, and Ghana CSA frameworks.*

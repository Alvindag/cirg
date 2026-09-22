"""PDF report generation (ReportLab) for incident reports and executive /
compliance summaries. Reports are written to Config.REPORTS_DIR."""

import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from backend.config import config

_STYLES = getSampleStyleSheet()
_TITLE_STYLE = ParagraphStyle("CIRGTitle", parent=_STYLES["Title"], alignment=TA_CENTER, fontSize=20)
_H2 = ParagraphStyle("CIRGH2", parent=_STYLES["Heading2"], spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#1a2a4a"))
_BODY = _STYLES["BodyText"]

_SEVERITY_COLORS = {
    "critical": colors.HexColor("#7a0d0d"),
    "high": colors.HexColor("#b3401f"),
    "medium": colors.HexColor("#b38a1f"),
    "low": colors.HexColor("#2f7a3d"),
    "info": colors.HexColor("#3a3a3a"),
}


def _severity_badge(severity: str) -> Paragraph:
    color = _SEVERITY_COLORS.get((severity or "").lower(), colors.black)
    return Paragraph(f'<font color="{color.hexval()}"><b>{(severity or "").upper()}</b></font>', _BODY)


def _report_path(prefix: str, identifier) -> str:
    os.makedirs(config.REPORTS_DIR, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    filename = f"{prefix}_{identifier}_{ts}.pdf"
    return os.path.join(config.REPORTS_DIR, filename)


def build_incident_report(incident: dict, timeline: list, alerts: list,
                           remediation_actions: list, assets: list) -> str:
    """Generates a NIST SP 800-61 Rev.2 formatted incident report. Returns
    the file path written."""
    path = _report_path("incident", incident["id"])
    doc = SimpleDocTemplate(
        path, pagesize=letter,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
    )
    story = []

    story.append(Paragraph("Cyber Incident Report", _TITLE_STYLE))
    story.append(Paragraph(f"CIRG Case #{incident['id']} — {incident['title']}", _STYLES["Heading3"]))
    story.append(Spacer(1, 0.15 * inch))

    meta_rows = [
        ["Severity", incident.get("severity", "").upper(), "Status", incident.get("status", "").upper()],
        ["Category", incident.get("category") or "-", "Created", str(incident.get("created_at") or "-")],
        ["Contained", str(incident.get("contained_at") or "-"), "Closed", str(incident.get("closed_at") or "-")],
        ["MITRE ATT&CK", ", ".join(incident.get("mitre_attack_techniques") or []) or "-", "", ""],
    ]
    meta_table = Table(meta_rows, colWidths=[1.3 * inch, 2.2 * inch, 1.3 * inch, 2.2 * inch])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Executive Summary", _H2))
    story.append(Paragraph(incident.get("summary") or "No summary provided.", _BODY))

    if incident.get("root_cause"):
        story.append(Paragraph("Root Cause", _H2))
        story.append(Paragraph(incident["root_cause"], _BODY))

    story.append(Paragraph("Affected Assets", _H2))
    if assets:
        rows = [["Hostname", "OS", "IP Address", "Criticality"]]
        for a in assets:
            rows.append([a.get("hostname", "-"), a.get("os_name", "-"), str(a.get("ip_address") or "-"), a.get("criticality", "-")])
        t = Table(rows, colWidths=[1.8 * inch, 1.8 * inch, 1.5 * inch, 1.9 * inch])
        t.setStyle(_table_style())
        story.append(t)
    else:
        story.append(Paragraph("No assets recorded.", _BODY))

    story.append(Paragraph("Related Alerts", _H2))
    if alerts:
        rows = [["Alert", "Severity", "Triggered", "Status"]]
        for al in alerts:
            rows.append([al.get("title", "-"), al.get("severity", "-"), str(al.get("triggered_at") or "-"), al.get("status", "-")])
        t = Table(rows, colWidths=[3.2 * inch, 1.0 * inch, 1.8 * inch, 1.0 * inch])
        t.setStyle(_table_style())
        story.append(t)
    else:
        story.append(Paragraph("No alerts linked.", _BODY))

    story.append(Paragraph("Remediation Actions Taken", _H2))
    if remediation_actions:
        rows = [["Action", "Status", "Requested", "Completed"]]
        for ra in remediation_actions:
            rows.append([ra.get("action_type", "-"), ra.get("status", "-"),
                         str(ra.get("requested_at") or "-"), str(ra.get("completed_at") or "-")])
        t = Table(rows, colWidths=[2.0 * inch, 1.2 * inch, 1.9 * inch, 1.9 * inch])
        t.setStyle(_table_style())
        story.append(t)
    else:
        story.append(Paragraph("No remediation actions recorded.", _BODY))

    story.append(PageBreak())
    story.append(Paragraph("Incident Timeline (NIST SP 800-61 Lifecycle)", _H2))
    if timeline:
        rows = [["Time", "Actor", "Action", "Notes"]]
        for ev in timeline:
            rows.append([str(ev.get("occurred_at") or "-"), ev.get("actor", "-"), ev.get("action", "-"), (ev.get("notes") or "")[:120]])
        t = Table(rows, colWidths=[1.6 * inch, 1.1 * inch, 1.5 * inch, 2.8 * inch])
        t.setStyle(_table_style())
        story.append(t)
    else:
        story.append(Paragraph("No timeline entries recorded.", _BODY))

    if incident.get("lessons_learned"):
        story.append(Paragraph("Lessons Learned / Post-Incident Recommendations", _H2))
        story.append(Paragraph(incident["lessons_learned"], _BODY))

    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph(
        "Generated by CIRG Enterprise Security Operations. Compliant with NIST SP 800-61 Rev.2, "
        "ACPO Good Practice Guide, and Ghana CSA Guidelines.",
        ParagraphStyle("footer", parent=_BODY, fontSize=7, textColor=colors.grey),
    ))

    doc.build(story)
    return path


def build_executive_summary(stats: dict, period_start, period_end) -> str:
    """Generates a period executive/compliance summary (NIST CSF-oriented)."""
    path = _report_path("executive_summary", datetime.utcnow().strftime("%Y%m%d"))
    doc = SimpleDocTemplate(path, pagesize=letter, topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    story = [
        Paragraph("Security Operations Executive Summary", _TITLE_STYLE),
        Paragraph(f"Reporting period: {period_start} — {period_end}", _STYLES["Heading4"]),
        Spacer(1, 0.2 * inch),
    ]

    kpi_rows = [
        ["Monitored Assets", str(stats.get("total_assets", 0)), "Online", str(stats.get("online_assets", 0))],
        ["Alerts Raised", str(stats.get("total_alerts", 0)), "Critical/High", str(stats.get("critical_high_alerts", 0))],
        ["Incidents Opened", str(stats.get("incidents_opened", 0)), "Incidents Closed", str(stats.get("incidents_closed", 0))],
        ["Mean Time to Contain", stats.get("mttc", "-"), "Remediation Actions", str(stats.get("remediation_actions", 0))],
    ]
    t = Table(kpi_rows, colWidths=[1.8 * inch, 1.5 * inch, 1.8 * inch, 1.5 * inch])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Top Alert Categories (by MITRE ATT&CK Technique)", _H2))
    top = stats.get("top_techniques", [])
    if top:
        rows = [["Technique", "Count"]] + [[row["technique"], str(row["c"])] for row in top]
        tt = Table(rows, colWidths=[3 * inch, 1.5 * inch])
        tt.setStyle(_table_style())
        story.append(tt)
    else:
        story.append(Paragraph("No alert activity in this period.", _BODY))

    story.append(Paragraph("Compliance Posture", _H2))
    story.append(Paragraph(
        "This summary supports NIST SP 800-61 Rev.2 post-incident reporting obligations, "
        "NIST Cybersecurity Framework 2.0 Detect/Respond/Recover function tracking, "
        "ACPO digital evidence handling principles, and Ghana CSA / Data Protection Act 2012 "
        "incident notification requirements.",
        _BODY,
    ))

    doc.build(story)
    return path


def _table_style() -> TableStyle:
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a2a4a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f6fa")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ])

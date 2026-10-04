"""
Recomputes a risk score for every asset: likelihood x impact, where impact
is the asset's business-criticality rating and likelihood blends a
baseline (asset type + internet exposure) with the highest CVSS score
among its open vulnerabilities. Also generates rule-based recommendations
from the same inputs.

Score = likelihood (1-5) x impact (1-5) -> 1-25, banded:
  1-4 low | 5-9 medium | 10-15 high | 16-25 critical
"""
import logging
from datetime import date

from db import get_conn

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("risk_engine")

BASELINE_LIKELIHOOD = {
    # asset_type -> base likelihood before vuln/exposure adjustment
    "physical": 2.0,
    "software": 2.0,
}
INTERNET_FACING_BONUS = 1.0
EOL_BONUS = 1.0  # past end-of-life assets are more likely to be exploited


def band_for_score(score):
    if score >= 16:
        return "critical"
    if score >= 10:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


def compute_likelihood(asset, max_cvss):
    baseline = BASELINE_LIKELIHOOD.get(asset["asset_type"], 2.0)
    if asset.get("internet_facing"):
        baseline += INTERNET_FACING_BONUS
    if asset.get("end_of_life_date") and asset["end_of_life_date"] < date.today():
        baseline += EOL_BONUS

    if max_cvss is not None:
        cvss_likelihood = (float(max_cvss) / 10.0) * 5.0
        # Weighted blend: known, scored vulnerabilities dominate the estimate,
        # but exposure/EOL factors still push it up further.
        likelihood = 0.4 * baseline + 0.6 * cvss_likelihood
    else:
        likelihood = baseline

    return round(min(max(likelihood, 1.0), 5.0), 1)


def fetch_open_vuln_stats(conn, asset_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT max(v.cvss_score) AS max_cvss, count(*) AS open_count
            FROM asset_vulnerabilities av
            JOIN vulnerabilities v ON v.id = av.vulnerability_id
            WHERE av.asset_id = %s AND av.status = 'open'
            """,
            (asset_id,),
        )
        row = cur.fetchone()
        return row["max_cvss"], row["open_count"] or 0


def fetch_open_vulns(conn, asset_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT v.cve_id, v.cvss_score, v.cvss_severity, v.title
            FROM asset_vulnerabilities av
            JOIN vulnerabilities v ON v.id = av.vulnerability_id
            WHERE av.asset_id = %s AND av.status = 'open'
            ORDER BY v.cvss_score DESC NULLS LAST
            """,
            (asset_id,),
        )
        return cur.fetchall()


def build_recommendations(conn, asset, assessment_id, max_cvss, open_count, risk_band):
    recs = []

    if open_count > 0:
        vulns = fetch_open_vulns(conn, asset["id"])
        critical_high = [v for v in vulns if (v["cvss_score"] or 0) >= 7.0]
        if critical_high:
            cve_list = ", ".join(v["cve_id"] or v["title"] for v in critical_high[:5])
            recs.append((
                "patch", "critical" if max_cvss and max_cvss >= 9.0 else "high",
                f"Apply vendor patches / upgrade to remediate high-severity findings: {cve_list}"
                + (f" (+{len(critical_high) - 5} more)" if len(critical_high) > 5 else ""),
            ))
        other = [v for v in vulns if (v["cvss_score"] or 0) < 7.0]
        if other:
            recs.append((
                "patch", "medium",
                f"Schedule remediation for {len(other)} lower-severity open finding(s) in the next patch cycle.",
            ))

    if asset.get("end_of_life_date") and asset["end_of_life_date"] < date.today():
        recs.append((
            "replace", "high",
            f"Asset is past its end-of-life date ({asset['end_of_life_date']}); "
            "plan replacement/upgrade — vendor patches are likely no longer available.",
        ))

    if asset.get("internet_facing") and risk_band in ("high", "critical"):
        recs.append((
            "compensating-control", "high",
            "Internet-facing asset carries high/critical risk — restrict exposure "
            "(place behind VPN/WAF, tighten firewall rules) until underlying findings are resolved.",
        ))

    if not asset.get("owner"):
        recs.append((
            "ownership", "medium",
            "No owner assigned — assign an accountable owner so remediation work has a clear driver.",
        ))

    if asset["asset_type"] == "physical" and not asset.get("location"):
        recs.append((
            "ownership", "low",
            "No physical location recorded — document it for accountability and incident response.",
        ))

    if risk_band == "critical" and not recs:
        recs.append((
            "accept", "critical",
            "Risk score is critical based on criticality/exposure alone (no specific findings) — "
            "review manually and document a mitigation plan or formal risk acceptance.",
        ))

    with conn.cursor() as cur:
        for category, priority, text in recs:
            cur.execute(
                """
                INSERT INTO recommendations (asset_id, risk_assessment_id, category, priority, recommendation)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (asset_id, category, recommendation) DO UPDATE
                    SET risk_assessment_id = EXCLUDED.risk_assessment_id,
                        priority = EXCLUDED.priority,
                        ts = now()
                """,
                (asset["id"], assessment_id, category, priority, text),
            )


def score_asset(conn, asset):
    max_cvss, open_count = fetch_open_vuln_stats(conn, asset["id"])
    impact = float(asset["criticality"])
    likelihood = compute_likelihood(asset, max_cvss)
    risk_score = round(likelihood * impact, 1)
    risk_band = band_for_score(risk_score)

    rationale_parts = [f"baseline likelihood for {asset['asset_type']} asset"]
    if asset.get("internet_facing"):
        rationale_parts.append("internet-facing (+)")
    if max_cvss is not None:
        rationale_parts.append(f"{open_count} open vuln(s), max CVSS {max_cvss}")
    rationale = "; ".join(rationale_parts)

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO risk_assessments
                (asset_id, likelihood, impact, max_cvss, open_vuln_count, risk_score, risk_band, rationale)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (asset["id"], likelihood, impact, max_cvss, open_count, risk_score, risk_band, rationale),
        )
        assessment_id = cur.fetchone()["id"]
    conn.commit()

    build_recommendations(conn, asset, assessment_id, max_cvss, open_count, risk_band)
    conn.commit()

    return risk_score, risk_band


def run():
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM assets")
        assets = cur.fetchall()

    for asset in assets:
        try:
            score, band = score_asset(conn, asset)
            logger.info("Asset %s (%s): risk_score=%s band=%s", asset["id"], asset["name"], score, band)
        except Exception:
            logger.exception("Failed to score asset %s", asset["id"])


if __name__ == "__main__":
    run()

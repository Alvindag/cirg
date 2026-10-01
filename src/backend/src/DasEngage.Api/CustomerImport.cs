using System.Globalization;
using System.Text;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api;

public record ImportRowResult(int Row, string Status, string? Message, Guid? CustomerId, Guid? MatchedCustomerId);

public record ImportResult(bool DryRun, int Total, int Created, int Updated, int Skipped, int Errors, List<ImportRowResult> Rows);

public enum DuplicateMode { Skip, Update }

/// <summary>RFC 4180 CSV reader: quoted fields, escaped quotes, embedded newlines, BOM, comma or semicolon delimiter.</summary>
public static class Csv
{
    public static List<List<string>> Parse(string text)
    {
        if (text.Length > 0 && text[0] == '﻿') text = text[1..];
        var firstLine = text.Split('\n', 2)[0];
        var delim = firstLine.Count(c => c == ';') > firstLine.Count(c => c == ',') ? ';' : ',';

        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (inQuotes)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') inQuotes = false;
                else field.Append(c);
            }
            else if (c == '"' && field.Length == 0) inQuotes = true;
            else if (c == delim) { row.Add(field.ToString()); field.Clear(); }
            else if (c == '\n' || c == '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(field.ToString()); field.Clear();
                if (row.Any(f => f.Length > 0)) rows.Add(row);
                row = new List<string>();
            }
            else field.Append(c);
        }
        if (inQuotes) throw new FormatException("Unterminated quoted field.");
        row.Add(field.ToString());
        if (row.Any(f => f.Length > 0)) rows.Add(row);
        return rows;
    }
}

public static class Normalize
{
    private static readonly HashSet<string> Titles = new() { "dr", "doctor", "prof", "professor", "mr", "mrs", "ms", "pharm", "pharmacist", "rev" };

    /// <summary>Lower-case, accent-free, punctuation-free, titles removed ("Dr. Kofi  Mensah" and "kofi mensah" match).</summary>
    public static string Name(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        var decomposed = s.Normalize(NormalizationForm.FormD)
            .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark);
        var cleaned = new string(decomposed.Select(c => char.IsLetterOrDigit(c) ? char.ToLowerInvariant(c) : ' ').ToArray());
        return string.Join(' ', cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(t => !Titles.Contains(t)));
    }

    /// <summary>Last 9 digits, so 024 123 4567, +233241234567 and 0241234567 compare equal.</summary>
    public static string Phone(string? s)
    {
        var d = new string((s ?? "").Where(char.IsDigit).ToArray());
        return d.Length < 7 ? "" : d.Length > 9 ? d[^9..] : d;
    }

    public static string Email(string? s) => (s ?? "").Trim().ToLowerInvariant();

    public static int Levenshtein(string a, string b)
    {
        var prev = Enumerable.Range(0, b.Length + 1).ToArray();
        for (var i = 1; i <= a.Length; i++)
        {
            var cur = new int[b.Length + 1];
            cur[0] = i;
            for (var j = 1; j <= b.Length; j++)
                cur[j] = Math.Min(Math.Min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + (a[i - 1] == b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[b.Length];
    }
}

public class CustomerImporter
{
    public const int MaxRows = 5000;
    private static readonly string[] Known =
    {
        "type", "name", "specialty", "segment", "territory", "parent", "phone", "email", "address", "city",
        "latitude", "longitude", "target_visits_per_month",
    };

    /// <summary>A customer already known (in the database or earlier in the file) for matching.</summary>
    private class Known_
    {
        public Guid Id; public CustomerType Type; public string Name = ""; public string City = "";
        public string Phone = ""; public string Email = ""; public Guid? TerritoryId; public bool IsNew; public int Row;
    }

    private readonly AppDbContext _db;
    private readonly TeamScope _team;
    private readonly HttpCurrentUser _user;
    public CustomerImporter(AppDbContext db, TeamScope team, HttpCurrentUser user) { _db = db; _team = team; _user = user; }

    public async Task<ImportResult> Run(string csv, bool dryRun, DuplicateMode mode, bool allowPossibleDuplicates)
    {
        var table = Csv.Parse(csv);
        if (table.Count == 0) throw new FormatException("The file is empty.");
        var headers = table[0].Select(h => h.Trim().ToLowerInvariant().Replace(' ', '_')).ToList();
        foreach (var required in new[] { "type", "name" })
            if (!headers.Contains(required)) throw new FormatException($"Missing required column '{required}'.");
        var unknown = headers.Where(h => !Known.Contains(h)).ToList();
        if (unknown.Count > 0) throw new FormatException($"Unknown column(s): {string.Join(", ", unknown)}.");
        if (table.Count - 1 > MaxRows) throw new FormatException($"Too many rows (max {MaxRows}).");

        var territories = await _db.Territories.AsNoTracking().ToDictionaryAsync(t => t.Name.ToLowerInvariant(), t => t.Id);
        var visibleTerritories = await _team.VisibleTerritoryIds();
        var existing = (await _db.Customers.AsNoTracking()
            .Select(c => new { c.Id, c.Type, c.Name, c.City, c.Phone, c.Email, c.TerritoryId }).ToListAsync())
            .Select(c => new Known_ { Id = c.Id, Type = c.Type, Name = Normalize.Name(c.Name), City = Normalize.Name(c.City),
                Phone = Normalize.Phone(c.Phone), Email = Normalize.Email(c.Email), TerritoryId = c.TerritoryId }).ToList();

        var all = new List<Known_>(existing);
        var results = new List<ImportRowResult>();
        var toAdd = new List<Customer>();
        var toUpdate = new List<(Guid Id, Dictionary<string, string> Values, Guid? Territory)>();

        for (var i = 1; i < table.Count; i++)
        {
            var rowNo = i + 1; // spreadsheet-style: header is row 1
            var cells = table[i];
            string Get(string col) { var ix = headers.IndexOf(col); return ix >= 0 && ix < cells.Count ? cells[ix].Trim() : ""; }

            ImportRowResult Fail(string msg) => new(rowNo, "error", msg, null, null);

            if (!Enum.TryParse<CustomerType>(Get("type").Replace(" ", ""), true, out var type) || !Enum.IsDefined(type))
            { results.Add(Fail($"Unknown type '{Get("type")}'. Use: {string.Join(", ", Enum.GetNames<CustomerType>())}.")); continue; }
            var name = Get("name");
            if (name.Length == 0) { results.Add(Fail("Name is required.")); continue; }
            if (name.Length > 200) { results.Add(Fail("Name is too long.")); continue; }

            var segment = Segment.Unclassified;
            if (Get("segment").Length > 0 && !Enum.TryParse(Get("segment"), true, out segment))
            { results.Add(Fail($"Unknown segment '{Get("segment")}'. Use A, B or C.")); continue; }

            Guid? territoryId = null;
            if (Get("territory").Length > 0)
            {
                if (!territories.TryGetValue(Get("territory").ToLowerInvariant(), out var tid))
                { results.Add(Fail($"Unknown territory '{Get("territory")}'.")); continue; }
                territoryId = tid;
            }
            if (visibleTerritories != null)
            {
                if (territoryId == null) { results.Add(Fail("Territory is required for your role.")); continue; }
                if (!visibleTerritories.Contains(territoryId.Value)) { results.Add(Fail("Territory is outside your scope.")); continue; }
            }

            double? lat = null, lng = null;
            if (Get("latitude").Length > 0 || Get("longitude").Length > 0)
            {
                if (!double.TryParse(Get("latitude"), NumberStyles.Float, CultureInfo.InvariantCulture, out var la) || la is < -90 or > 90 ||
                    !double.TryParse(Get("longitude"), NumberStyles.Float, CultureInfo.InvariantCulture, out var lo) || lo is < -180 or > 180)
                { results.Add(Fail("Latitude/longitude must both be valid numbers.")); continue; }
                lat = la; lng = lo;
            }

            var target = segment switch { Segment.A => 4, Segment.B => 2, Segment.C => 1, _ => 0 };
            if (Get("target_visits_per_month").Length > 0 &&
                (!int.TryParse(Get("target_visits_per_month"), out target) || target is < 0 or > 60))
            { results.Add(Fail("target_visits_per_month must be a whole number from 0 to 60.")); continue; }

            Guid? parentId = null;
            if (Get("parent").Length > 0)
            {
                var pn = Normalize.Name(Get("parent"));
                var parents = all.Where(k => k.Name == pn && k.Type is CustomerType.Hospital or CustomerType.Clinic or CustomerType.Pharmacy
                    or CustomerType.GovernmentInstitution).ToList();
                if (parents.Count == 0) { results.Add(Fail($"Parent '{Get("parent")}' not found (list it earlier in the file or import it first).")); continue; }
                if (parents.Count > 1) { results.Add(Fail($"Parent '{Get("parent")}' is ambiguous ({parents.Count} matches).")); continue; }
                parentId = parents[0].Id;
            }

            // ---- de-duplication ----
            var key = new Known_ { Type = type, Name = Normalize.Name(name), City = Normalize.Name(Get("city")),
                Phone = Normalize.Phone(Get("phone")), Email = Normalize.Email(Get("email")), TerritoryId = territoryId };

            // exact: same email, same phone+type, or same type+name+city
            var exact = all.FirstOrDefault(k =>
                (key.Email.Length > 0 && k.Email == key.Email) ||
                (key.Phone.Length > 0 && k.Phone == key.Phone && k.Type == key.Type) ||
                (k.Type == key.Type && k.Name == key.Name && k.City == key.City));
            if (exact != null)
            {
                var where = exact.IsNew ? $"row {exact.Row} of this file" : "an existing customer";
                if (mode == DuplicateMode.Update && !exact.IsNew)
                {
                    if (visibleTerritories != null && (exact.TerritoryId == null || !visibleTerritories.Contains(exact.TerritoryId.Value)))
                    { results.Add(Fail("Matches an existing customer outside your scope.")); continue; }
                    var values = Known.Where(c => Get(c).Length > 0).ToDictionary(c => c, Get);
                    toUpdate.Add((exact.Id, values, territoryId));
                    results.Add(new ImportRowResult(rowNo, "updated", $"Matched {where}; non-empty fields applied.", exact.Id, exact.Id));
                }
                else results.Add(new ImportRowResult(rowNo, "duplicate", $"Duplicate of {where}.", null, exact.Id));
                continue;
            }

            // possible: same type + city, names within a small edit distance (typos, spelling variants)
            var maxDist = key.Name.Length >= 12 ? 2 : 1;
            var possible = key.Name.Length < 5 ? null : all.FirstOrDefault(k => k.Type == key.Type && k.City == key.City &&
                Math.Abs(k.Name.Length - key.Name.Length) <= maxDist && Normalize.Levenshtein(k.Name, key.Name) <= maxDist);
            if (possible != null && !allowPossibleDuplicates)
            {
                results.Add(new ImportRowResult(rowNo, "possible_duplicate",
                    $"Very similar to {(possible.IsNew ? $"row {possible.Row}" : "an existing customer")}; re-run with allowPossibleDuplicates=true to import anyway.",
                    null, possible.Id));
                continue;
            }

            var c = new Customer
            {
                Id = Guid.NewGuid(), Type = type, Name = name, Specialty = Nz(Get("specialty")), Segment = segment,
                TerritoryId = territoryId, ParentCustomerId = parentId, Phone = Nz(Get("phone")), Email = Nz(Get("email")),
                Address = Nz(Get("address")), City = Nz(Get("city")), Latitude = lat, Longitude = lng, TargetVisitsPerMonth = target,
            };
            toAdd.Add(c);
            key.Id = c.Id; key.IsNew = true; key.Row = rowNo;
            all.Add(key);
            results.Add(new ImportRowResult(rowNo, "created", possible != null ? "Created (similar customer exists)." : null, c.Id, possible?.Id));
        }

        if (!dryRun && (toAdd.Count > 0 || toUpdate.Count > 0))
        {
            _db.Customers.AddRange(toAdd);
            foreach (var (id, values, territory) in toUpdate)
            {
                var c = await _db.Customers.FirstAsync(x => x.Id == id);
                if (values.TryGetValue("specialty", out var v)) c.Specialty = v;
                if (values.TryGetValue("segment", out v) && Enum.TryParse<Segment>(v, true, out var seg)) c.Segment = seg;
                if (values.ContainsKey("territory")) c.TerritoryId = territory;
                if (values.TryGetValue("phone", out v)) c.Phone = v;
                if (values.TryGetValue("email", out v)) c.Email = v;
                if (values.TryGetValue("address", out v)) c.Address = v;
                if (values.TryGetValue("city", out v)) c.City = v;
                if (values.TryGetValue("latitude", out v) && values.TryGetValue("longitude", out var lo2) &&
                    double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var la2) &&
                    double.TryParse(lo2, NumberStyles.Float, CultureInfo.InvariantCulture, out var lo3)) { c.Latitude = la2; c.Longitude = lo3; }
                if (values.TryGetValue("target_visits_per_month", out v) && int.TryParse(v, out var tv)) c.TargetVisitsPerMonth = tv;
            }
            await _db.SaveChangesAsync();
        }

        return new ImportResult(dryRun, results.Count,
            results.Count(r => r.Status == "created"), results.Count(r => r.Status == "updated"),
            results.Count(r => r.Status is "duplicate" or "possible_duplicate"), results.Count(r => r.Status == "error"), results);
    }

    private static string? Nz(string s) => s.Length == 0 ? null : s;
}

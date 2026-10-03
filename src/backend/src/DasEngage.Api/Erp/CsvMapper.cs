using System.Globalization;

namespace DasEngage.Api.Erp;

/// <summary>Reads ERP exports saved as CSV. Rows that cannot be read become per-row errors; the rest are still imported.</summary>
public static class CsvMapper
{
    public record Parsed<T>(List<T> Items, List<ItemOutcome> Errors);

    private class Row
    {
        private readonly List<string> _headers; private readonly List<string> _cells; public int Number { get; }
        public Row(List<string> headers, List<string> cells, int number) { _headers = headers; _cells = cells; Number = number; }
        public string Get(string col) { var i = _headers.IndexOf(col); return i >= 0 && i < _cells.Count ? _cells[i].Trim() : ""; }
        public string? Opt(string col) { var v = Get(col); return v.Length == 0 ? null : v; }
    }

    private static List<Row> Rows(string csv, params string[] required)
    {
        var table = Csv.Parse(csv);
        if (table.Count == 0) throw new FormatException("The file is empty.");
        var headers = table[0].Select(h => h.Trim().ToLowerInvariant().Replace(' ', '_')).ToList();
        foreach (var r in required) if (!headers.Contains(r)) throw new FormatException($"Missing required column '{r}'.");
        if (table.Count - 1 > ErpImporter.MaxBatch) throw new FormatException($"Too many rows (max {ErpImporter.MaxBatch}).");
        return table.Skip(1).Select((c, i) => new Row(headers, c, i + 2)).ToList();
    }

    private static decimal? Dec(Row r, string col, List<ItemOutcome> errors, out bool bad)
    {
        bad = false;
        var v = r.Get(col);
        if (v.Length == 0) return null;
        if (decimal.TryParse(v.Replace(",", ""), NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var d)) return d;
        errors.Add(new($"row {r.Number}", "error", $"'{col}' is not a number: {v}")); bad = true;
        return null;
    }

    private static DateOnly? Day(Row r, string col, List<ItemOutcome> errors, out bool bad)
    {
        bad = false;
        var v = r.Get(col);
        if (DateOnly.TryParseExact(v, new[] { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return d;
        errors.Add(new($"row {r.Number}", "error", $"'{col}' is not a date (use yyyy-MM-dd or dd/MM/yyyy): {v}")); bad = true;
        return null;
    }

    public static Parsed<ErpProduct> Products(string csv)
    {
        var items = new List<ErpProduct>(); var errors = new List<ItemOutcome>();
        foreach (var r in Rows(csv, "item_code", "name"))
        {
            var cost = Dec(r, "standard_cost", errors, out var b1); var reorder = Dec(r, "reorder_level", errors, out var b2);
            var price = Dec(r, "list_price", errors, out var b3);
            if (b1 || b2 || b3) continue;
            items.Add(new ErpProduct(r.Get("item_code"), r.Get("name"), r.Opt("therapeutic_area"), cost, reorder is null ? null : (int)reorder, price));
        }
        return new(items, errors);
    }

    public static Parsed<ErpCustomer> Customers(string csv) => new(Rows(csv, "account_code", "name")
        .Select(r => new ErpCustomer(r.Get("account_code"), r.Get("name"), r.Opt("type"), r.Opt("city"), r.Opt("phone"), r.Opt("email"))).ToList(), new());

    public static Parsed<ErpSale> Sales(string csv)
    {
        var items = new List<ErpSale>(); var errors = new List<ItemOutcome>();
        foreach (var r in Rows(csv, "external_id", "date", "account_code", "item_code", "quantity", "net_amount"))
        {
            var date = Day(r, "date", errors, out var b1); var qty = Dec(r, "quantity", errors, out var b2); var amt = Dec(r, "net_amount", errors, out var b3);
            if (b1 || b2 || b3) continue;
            items.Add(new ErpSale(r.Get("external_id"), r.Get("document_number"), date!.Value, r.Get("account_code"), r.Get("item_code"), qty ?? 0, amt ?? 0, r.Opt("currency")));
        }
        return new(items, errors);
    }

    public static Parsed<ErpGoodsReceipt> GoodsReceipts(string csv)
    {
        var items = new List<ErpGoodsReceipt>(); var errors = new List<ItemOutcome>();
        foreach (var r in Rows(csv, "external_id", "item_code", "batch_number", "expiry_date", "quantity"))
        {
            var expiry = Day(r, "expiry_date", errors, out var b1); var qty = Dec(r, "quantity", errors, out var b2);
            if (b1 || b2) continue;
            items.Add(new ErpGoodsReceipt(r.Get("external_id"), r.Get("item_code"), r.Get("batch_number"), expiry!.Value, (int)(qty ?? 0), r.Opt("requisition_ref"), null));
        }
        return new(items, errors);
    }

    public static Parsed<ErpBalance> Balances(string csv)
    {
        var items = new List<ErpBalance>(); var errors = new List<ItemOutcome>();
        foreach (var r in Rows(csv, "account_code"))
        {
            var limit = Dec(r, "credit_limit", errors, out var b1); var owed = Dec(r, "outstanding", errors, out var b2); var late = Dec(r, "overdue", errors, out var b3);
            if (b1 || b2 || b3) continue;
            items.Add(new ErpBalance(r.Get("account_code"), limit, owed, late, null));
        }
        return new(items, errors);
    }

    public static Parsed<ErpStockLevel> StockLevels(string csv)
    {
        var items = new List<ErpStockLevel>(); var errors = new List<ItemOutcome>();
        foreach (var r in Rows(csv, "item_code", "quantity"))
        {
            var qty = Dec(r, "quantity", errors, out var bad);
            if (bad) continue;
            items.Add(new ErpStockLevel(r.Get("item_code"), r.Opt("batch_number"), qty ?? 0, null));
        }
        return new(items, errors);
    }
}

using System.Globalization;
using DasEngage.Domain;
using DasEngage.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace DasEngage.Api.Erp;

/// <summary>
/// Applies ERP data to DAS Engage. The same rules apply whether the data was pushed by middleware, pulled on a schedule
/// or uploaded as a CSV. Every method is idempotent: sending the same records again changes nothing.
/// </summary>
public class ErpImporter
{
    public const int MaxBatch = 5000;
    private readonly AppDbContext _db;
    private readonly ICurrentUser _user;
    private readonly SampleService _samples;

    public ErpImporter(AppDbContext db, ICurrentUser user, SampleService samples) { _db = db; _user = user; _samples = samples; }

    private static ImportSummary Summary(string entity, string source, List<ItemOutcome> items) => new(entity, source,
        items.Count(i => i.Status == "created"), items.Count(i => i.Status == "updated"), items.Count(i => i.Status is "unchanged" or "duplicate" or "unmatched"),
        items.Count(i => i.Status == "error"), items);

    private async Task<ImportSummary> Log(string entity, string source, List<ItemOutcome> items, DateTime started)
    {
        var s = Summary(entity, source, items);
        _db.SyncRuns.Add(new SyncRun
        {
            Entity = entity, Source = source, StartedAt = started, FinishedAt = DateTime.UtcNow, Created = s.Created, Updated = s.Updated, Skipped = s.Skipped, Errors = s.Errors,
            Message = s.Errors > 0 ? $"{s.Errors} record(s) refused." : null,
        });
        await _db.SaveChangesAsync();
        return s;
    }

    private static string? Check(bool batchTooBig) => batchTooBig ? $"A batch can hold at most {MaxBatch} records." : null;

    // ---------- products ----------

    public async Task<ImportSummary> Products(IReadOnlyList<ErpProduct> list, string source)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        var all = await _db.Products.ToListAsync();
        foreach (var p in list)
        {
            var code = p.ItemCode?.Trim() ?? "";
            if (code.Length is 0 or > 50) { items.Add(new(code, "error", "ItemCode is required (max 50 characters).")); continue; }
            if (string.IsNullOrWhiteSpace(p.Name) || p.Name.Length > 200) { items.Add(new(code, "error", "Name is required (max 200 characters).")); continue; }
            if (p.StandardCost < 0 || p.ReorderLevel < 0 || p.ListPrice < 0) { items.Add(new(code, "error", "Cost, reorder level and price cannot be negative.")); continue; }

            var existing = all.FirstOrDefault(x => string.Equals(x.Code, code, StringComparison.OrdinalIgnoreCase))
                ?? all.FirstOrDefault(x => x.Code == null && Normalize.Name(x.Name) == Normalize.Name(p.Name)); // an item added by hand before the ERP link
            if (existing is null)
            {
                var n = new Product { Code = code, Name = p.Name.Trim(), TherapeuticArea = p.TherapeuticArea, StandardCost = p.StandardCost, ReorderLevel = p.ReorderLevel, ListPrice = p.ListPrice };
                _db.Products.Add(n); all.Add(n);
                items.Add(new(code, "created", null));
                continue;
            }
            var changed = existing.Code != code || existing.Name != p.Name.Trim() || existing.TherapeuticArea != (p.TherapeuticArea ?? existing.TherapeuticArea)
                || existing.StandardCost != (p.StandardCost ?? existing.StandardCost) || existing.ReorderLevel != (p.ReorderLevel ?? existing.ReorderLevel) || existing.ListPrice != (p.ListPrice ?? existing.ListPrice);
            existing.Code = code; existing.Name = p.Name.Trim();
            existing.TherapeuticArea = p.TherapeuticArea ?? existing.TherapeuticArea;
            existing.StandardCost = p.StandardCost ?? existing.StandardCost;
            existing.ReorderLevel = p.ReorderLevel ?? existing.ReorderLevel;
            existing.ListPrice = p.ListPrice ?? existing.ListPrice;
            items.Add(new(code, changed ? "updated" : "unchanged", null));
        }
        var summary = await Log("products", source, items, started);
        await RelinkSales();
        return summary;
    }

    // ---------- customers ----------

    /// <summary>Links ERP accounts to DAS customers: by account code, else by exact normalised name and city. Optionally creates the rest.</summary>
    public async Task<ImportSummary> Customers(IReadOnlyList<ErpCustomer> list, string source, bool createMissing)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        var customers = await _db.Customers.ToListAsync();
        foreach (var c in list)
        {
            var code = c.AccountCode?.Trim() ?? "";
            if (code.Length is 0 or > 50) { items.Add(new(code, "error", "AccountCode is required (max 50 characters).")); continue; }
            if (string.IsNullOrWhiteSpace(c.Name) || c.Name.Length > 200) { items.Add(new(code, "error", "Name is required (max 200 characters).")); continue; }

            var existing = customers.FirstOrDefault(x => string.Equals(x.ErpAccountCode, code, StringComparison.OrdinalIgnoreCase));
            string status;
            if (existing != null) status = "unchanged";
            else
            {
                var name = Normalize.Name(c.Name); var city = Normalize.Name(c.City);
                var matches = customers.Where(x => x.ErpAccountCode == null && Normalize.Name(x.Name) == name && Normalize.Name(x.City) == city).ToList();
                if (matches.Count == 1) { existing = matches[0]; existing.ErpAccountCode = code; status = "updated"; }
                else if (matches.Count > 1) { items.Add(new(code, "unmatched", "More than one DAS customer matches this name and city; link it by hand.")); continue; }
                else if (createMissing)
                {
                    var type = Enum.TryParse<CustomerType>(c.Type?.Replace(" ", ""), true, out var t) && Enum.IsDefined(t) ? t : CustomerType.Pharmacy;
                    existing = new Customer { Name = c.Name.Trim(), Type = type, City = c.City, Phone = c.Phone, Email = c.Email, ErpAccountCode = code, Segment = Segment.Unclassified };
                    _db.Customers.Add(existing); customers.Add(existing);
                    status = "created";
                }
                else { items.Add(new(code, "unmatched", "No DAS customer with this account code, name and city. Link it, or import with createMissing.")); continue; }
            }
            items.Add(new(code, status, null));
        }
        var summary = await Log("customers", source, items, started);
        await RelinkSales();
        return summary;
    }

    /// <summary>Links one ERP account to one DAS customer by hand (for the accounts the automatic match could not resolve).</summary>
    public async Task<string?> LinkCustomer(Guid customerId, string accountCode)
    {
        accountCode = accountCode?.Trim() ?? "";
        if (accountCode.Length is 0 or > 50) return "AccountCode is required (max 50 characters).";
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == customerId);
        if (customer is null) return "Customer not found.";
        var other = await _db.Customers.FirstOrDefaultAsync(c => c.ErpAccountCode == accountCode && c.Id != customerId);
        if (other != null) return $"Account {accountCode} is already linked to {other.Name}.";
        customer.ErpAccountCode = accountCode;
        await _db.SaveChangesAsync();
        await RelinkSales();
        return null;
    }

    /// <summary>Attaches invoice lines that arrived before their customer or product was known.</summary>
    public async Task<int> RelinkSales()
    {
        var loose = await _db.SalesFacts.Where(s => s.CustomerId == null || s.ProductId == null).ToListAsync();
        if (loose.Count == 0) return 0;
        var customers = (await _db.Customers.Where(c => c.ErpAccountCode != null).Select(c => new { c.Id, c.ErpAccountCode }).ToListAsync())
            .GroupBy(c => c.ErpAccountCode!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var products = (await _db.Products.Where(p => p.Code != null).Select(p => new { p.Id, p.Code }).ToListAsync())
            .GroupBy(p => p.Code!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var n = 0;
        foreach (var s in loose)
        {
            if (s.CustomerId == null && customers.TryGetValue(s.AccountCode.ToLowerInvariant(), out var cid)) { s.CustomerId = cid; n++; }
            if (s.ProductId == null && products.TryGetValue(s.ItemCode.ToLowerInvariant(), out var pid)) { s.ProductId = pid; n++; }
        }
        if (n > 0) await _db.SaveChangesAsync();
        return n;
    }

    // ---------- sales ----------

    public async Task<ImportSummary> Sales(IReadOnlyList<ErpSale> list, string source, string defaultCurrency)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        var ids = list.Select(s => s.ExternalId).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList();
        var existing = await _db.SalesFacts.Where(s => ids.Contains(s.ExternalId)).ToDictionaryAsync(s => s.ExternalId);
        var customers = (await _db.Customers.Where(c => c.ErpAccountCode != null).Select(c => new { c.Id, c.ErpAccountCode }).ToListAsync())
            .GroupBy(c => c.ErpAccountCode!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var products = (await _db.Products.Where(p => p.Code != null).Select(p => new { p.Id, p.Code }).ToListAsync())
            .GroupBy(p => p.Code!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var seen = new HashSet<string>();

        foreach (var s in list)
        {
            var key = s.ExternalId?.Trim() ?? "";
            if (key.Length is 0 or > 100) { items.Add(new(key, "error", "ExternalId is required (max 100 characters).")); continue; }
            if (!seen.Add(key)) { items.Add(new(key, "duplicate", "Repeated within this batch; the first occurrence was used.")); continue; }
            if (string.IsNullOrWhiteSpace(s.AccountCode) || string.IsNullOrWhiteSpace(s.ItemCode)) { items.Add(new(key, "error", "AccountCode and ItemCode are required.")); continue; }
            if (s.Date == default || s.Date > DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1))) { items.Add(new(key, "error", "Date is missing or in the future.")); continue; }
            if (Math.Abs(s.NetAmount) > 1_000_000_000m || Math.Abs(s.Quantity) > 100_000_000m) { items.Add(new(key, "error", "Amount or quantity is out of range.")); continue; }
            var currency = (s.Currency ?? defaultCurrency).Trim().ToUpperInvariant();
            if (currency.Length != 3) { items.Add(new(key, "error", "Currency must be a 3-letter code.")); continue; }

            customers.TryGetValue(s.AccountCode.Trim().ToLowerInvariant(), out var cid);
            products.TryGetValue(s.ItemCode.Trim().ToLowerInvariant(), out var pid);
            if (existing.TryGetValue(key, out var row))
            {
                var changed = row.NetAmount != s.NetAmount || row.Quantity != s.Quantity || row.SaleDate != s.Date || row.AccountCode != s.AccountCode.Trim()
                    || row.ItemCode != s.ItemCode.Trim() || row.Currency != currency || row.DocumentNumber != (s.DocumentNumber ?? "");
                if (changed) // the ERP corrected the invoice line
                {
                    row.NetAmount = s.NetAmount; row.Quantity = s.Quantity; row.SaleDate = s.Date; row.AccountCode = s.AccountCode.Trim(); row.ItemCode = s.ItemCode.Trim();
                    row.Currency = currency; row.DocumentNumber = s.DocumentNumber ?? "";
                    row.CustomerId = cid == default ? null : cid; row.ProductId = pid == default ? null : pid;
                }
                items.Add(new(key, changed ? "updated" : "unchanged", null));
                continue;
            }
            _db.SalesFacts.Add(new SalesFact
            {
                ExternalId = key, DocumentNumber = s.DocumentNumber ?? "", SaleDate = s.Date, AccountCode = s.AccountCode.Trim(), ItemCode = s.ItemCode.Trim(),
                Quantity = s.Quantity, NetAmount = s.NetAmount, Currency = currency, CustomerId = cid == default ? null : cid, ProductId = pid == default ? null : pid,
            });
            items.Add(new(key, "created", cid == default ? "Customer account not linked yet." : null));
        }
        return await Log("sales", source, items, started);
    }

    // ---------- goods receipts ----------

    /// <summary>
    /// A purchase received into the warehouse becomes batch stock. The batch is created if new; a batch that already exists must carry the same expiry.
    /// A receipt against a purchase requisition updates that requisition.
    /// </summary>
    public async Task<ImportSummary> GoodsReceipts(IReadOnlyList<ErpGoodsReceipt> list, string source)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        foreach (var r in list)
        {
            var key = r.ExternalId?.Trim() ?? "";
            if (key.Length is 0 or > 100) { items.Add(new(key, "error", "ExternalId is required (max 100 characters).")); continue; }
            if (await _db.ErpDocuments.AnyAsync(d => d.Type == "receipt" && d.ExternalId == key)) { items.Add(new(key, "duplicate", "Already received.")); continue; }
            if (r.Quantity < 1 || r.Quantity > 1_000_000) { items.Add(new(key, "error", "Quantity must be between 1 and 1,000,000.")); continue; }
            if (string.IsNullOrWhiteSpace(r.BatchNumber) || r.BatchNumber.Length > 50) { items.Add(new(key, "error", "BatchNumber is required (max 50 characters).")); continue; }
            if (r.ExpiryDate <= SampleService.Today) { items.Add(new(key, "error", "The batch has already expired.")); continue; }
            var code = r.ItemCode?.Trim() ?? "";
            var product = await _db.Products.FirstOrDefaultAsync(p => p.Code == code);
            if (product is null) { items.Add(new(key, "error", $"Unknown item {code}. Import products first.")); continue; }

            var number = r.BatchNumber.Trim();
            var batch = await _db.SampleBatches.FirstOrDefaultAsync(b => b.ProductId == product.Id && b.BatchNumber == number)
                ?? _db.SampleBatches.Local.FirstOrDefault(b => b.ProductId == product.Id && b.BatchNumber == number);
            if (batch != null && batch.ExpiryDate != r.ExpiryDate) { items.Add(new(key, "error", $"Batch {number} exists with expiry {batch.ExpiryDate:yyyy-MM-dd}, not {r.ExpiryDate:yyyy-MM-dd}.")); continue; }
            if (batch != null && batch.Status != BatchStatus.Active) { items.Add(new(key, "error", $"Batch {number} is {batch.Status}.")); continue; }
            if (batch is null)
            {
                batch = new SampleBatch { ProductId = product.Id, BatchNumber = number, ExpiryDate = r.ExpiryDate };
                _db.SampleBatches.Add(batch);
            }
            _samples.ReceiveInto(batch.Id, r.Quantity, $"ERP receipt {key}", (r.ReceivedAt ?? DateTime.UtcNow).ToUniversalTime());
            _db.ErpDocuments.Add(new ErpDocument { Type = "receipt", ExternalId = key, Result = $"{r.Quantity} × {product.Name} batch {number}" });

            if (!string.IsNullOrWhiteSpace(r.RequisitionRef))
            {
                var reference = r.RequisitionRef.Trim();
                var req = await _db.PurchaseRequisitions.FirstOrDefaultAsync(q => q.ErpReference == reference && q.ProductId == product.Id);
                if (req != null)
                {
                    req.ReceivedQuantity += r.Quantity;
                    if (req.ReceivedQuantity >= req.Quantity) req.Status = RequisitionStatus.Received;
                }
            }
            await _db.SaveChangesAsync();
            items.Add(new(key, "created", null));
        }
        return await Log("goods-receipts", source, items, started);
    }

    // ---------- stock snapshot ----------

    public async Task<ImportSummary> StockLevels(IReadOnlyList<ErpStockLevel> list, string source)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        var products = (await _db.Products.Where(p => p.Code != null).Select(p => new { p.Id, p.Code }).ToListAsync())
            .GroupBy(p => p.Code!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var snaps = await _db.ErpStockSnapshots.ToListAsync();
        foreach (var l in list)
        {
            var code = l.ItemCode?.Trim() ?? "";
            if (code.Length is 0 or > 50) { items.Add(new(code, "error", "ItemCode is required.")); continue; }
            if (l.Quantity < 0) { items.Add(new($"{code}/{l.BatchNumber}", "error", "Quantity cannot be negative.")); continue; }
            var batch = string.IsNullOrWhiteSpace(l.BatchNumber) ? null : l.BatchNumber.Trim();
            var key = $"{code}/{batch}";
            var asOf = (l.AsOf ?? DateTime.UtcNow).ToUniversalTime();
            var row = snaps.FirstOrDefault(s => s.ItemCode == code && s.BatchNumber == batch);
            if (row is null)
            {
                row = new ErpStockSnapshot { ItemCode = code, BatchNumber = batch };
                _db.ErpStockSnapshots.Add(row); snaps.Add(row);
                items.Add(new(key, "created", null));
            }
            else if (row.AsOf > asOf) { items.Add(new(key, "unchanged", "A newer snapshot is already stored.")); continue; }
            else items.Add(new(key, row.Quantity == l.Quantity ? "unchanged" : "updated", null));
            row.Quantity = l.Quantity; row.AsOf = asOf;
            row.ProductId = products.TryGetValue(code.ToLowerInvariant(), out var pid) ? pid : null;
        }
        return await Log("stock-levels", source, items, started);
    }

    // ---------- customer balances and credit limits ----------

    /// <summary>
    /// What each customer owes (and may owe), by ERP account code. A value that is left out keeps what is stored; an account that matches no customer is refused,
    /// so nothing is created from a balance list.
    /// </summary>
    public async Task<ImportSummary> Balances(IReadOnlyList<ErpBalance> list, string source)
    {
        var started = DateTime.UtcNow;
        if (Check(list.Count > MaxBatch) is { } big) throw new ArgumentException(big);
        var items = new List<ItemOutcome>();
        var customers = (await _db.Customers.Where(c => c.ErpAccountCode != null).Select(c => new { c.Id, c.ErpAccountCode }).ToListAsync())
            .GroupBy(c => c.ErpAccountCode!.ToLowerInvariant()).ToDictionary(g => g.Key, g => g.First().Id);
        var credits = (await _db.CustomerCredits.ToListAsync()).ToDictionary(c => c.CustomerId);
        var seen = new HashSet<string>();
        foreach (var b in list)
        {
            var code = b.AccountCode?.Trim() ?? "";
            if (code.Length is 0 or > 50) { items.Add(new(code, "error", "AccountCode is required.")); continue; }
            if (!seen.Add(code.ToLowerInvariant())) { items.Add(new(code, "duplicate", "Repeated within this batch; the first occurrence was used.")); continue; }
            if (b.CreditLimit < 0 || b.Outstanding < 0 || b.Overdue < 0) { items.Add(new(code, "error", "Amounts cannot be negative.")); continue; }
            if (Math.Max(Math.Max(b.CreditLimit ?? 0, b.Outstanding ?? 0), b.Overdue ?? 0) > 1_000_000_000_000m) { items.Add(new(code, "error", "An amount is out of range.")); continue; }
            if (b.Overdue > b.Outstanding) { items.Add(new(code, "error", "Overdue cannot be more than outstanding.")); continue; }
            if (!customers.TryGetValue(code.ToLowerInvariant(), out var cid)) { items.Add(new(code, "error", "No customer has this account code. Link it first (ERP → Unmatched).")); continue; }
            var asOf = (b.AsOf ?? DateTime.UtcNow).ToUniversalTime();
            if (!credits.TryGetValue(cid, out var row))
            {
                row = new CustomerCredit { CustomerId = cid };
                _db.CustomerCredits.Add(row); credits[cid] = row;
                items.Add(new(code, "created", null));
            }
            else if (row.AsOf > asOf) { items.Add(new(code, "unchanged", "Newer balances are already stored.")); continue; }
            else items.Add(new(code, row.CreditLimit == (b.CreditLimit ?? row.CreditLimit) && row.Outstanding == (b.Outstanding ?? row.Outstanding) && row.Overdue == (b.Overdue ?? row.Overdue) ? "unchanged" : "updated", null));
            row.CreditLimit = b.CreditLimit ?? row.CreditLimit;
            row.Outstanding = b.Outstanding ?? row.Outstanding;
            row.Overdue = b.Overdue ?? row.Overdue;
            row.AsOf = asOf;
        }
        return await Log("balances", source, items, started);
    }
}

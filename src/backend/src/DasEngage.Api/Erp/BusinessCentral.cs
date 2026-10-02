using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DasEngage.Domain;

namespace DasEngage.Api.Erp;

/// <summary>
/// Adapter for Microsoft Dynamics 365 Business Central (SaaS) using its standard API v2.0 and Entra ID client-credentials sign-in.
/// The connection's address is the company's API root, for example
/// <c>https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({company-guid})</c>,
/// and its secret name points to the Entra client secret (value in Key Vault). Settings: <c>Erp:BusinessCentral:*</c>. See docs/business-central.md.
/// </summary>
public class BusinessCentralConnector : IErpConnector
{
    public const string Provider = "businesscentral";
    public const string Host = "api.businesscentral.dynamics.com";
    public const int PageSize = 1000;

    private static readonly Regex RootPattern = new(
        @"^/v2\.0/(?<tenant>[^/]+)/(?<env>[^/]+)/api/v2\.0/companies\((?<company>[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})\)/?$", RegexOptions.Compiled);

    private readonly HttpClient _http;
    private readonly ISecretProvider _secrets;
    private readonly string? _clientId;
    private readonly string _loginHost;
    private readonly string _vendor;
    private readonly string _customApi;
    private readonly Func<DateTime> _now;
    // shared: the HTTP client factory makes a new connector per scope, but a token is good for about an hour
    private static readonly Dictionary<string, (string Token, DateTime Expires)> _tokens = new();
    private static readonly SemaphoreSlim _tokenLock = new(1, 1);

    public BusinessCentralConnector(HttpClient http, ISecretProvider secrets, IConfiguration config, Func<DateTime>? now = null)
    {
        _http = http; _secrets = secrets; _now = now ?? (() => DateTime.UtcNow);
        _clientId = config["Erp:BusinessCentral:ClientId"];
        _loginHost = config["Erp:BusinessCentral:LoginHost"] ?? "login.microsoftonline.com";
        _vendor = config["Erp:BusinessCentral:DefaultVendorNumber"] ?? "";
        _customApi = (config["Erp:BusinessCentral:CustomApi"] ?? "das/engage/v1.0").Trim('/');
    }

    /// <summary>Null when the address is a Business Central company API root; otherwise what is wrong with it.</summary>
    public static string? ValidateBaseUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u)) return "Enter the company's API address, for example https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({company id}).";
        if (u.Scheme != Uri.UriSchemeHttps || !string.Equals(u.IdnHost, Host, StringComparison.OrdinalIgnoreCase) || !string.IsNullOrEmpty(u.UserInfo) || !u.IsDefaultPort) return $"The address must be an https://{Host} address.";
        if (!RootPattern.IsMatch(Uri.UnescapeDataString(u.AbsolutePath)) || !string.IsNullOrEmpty(u.Query)) return "The address must end with /api/v2.0/companies({company id}).";
        return null;
    }

    private record Target(Uri Root, string TenantId, string Company)
    {
        public Uri Entity(string path) => new($"{Root.ToString().TrimEnd('/')}/{path}");
        public Uri Custom(string customApi, string path) => new($"{Root.ToString().TrimEnd('/').Replace("/api/v2.0/", $"/api/{customApi}/")}/{path}");
    }

    private static Target? Parse(ErpConnection c, out string? error)
    {
        error = ValidateBaseUrl(c.BaseUrl);
        if (error != null) return null;
        var uri = new Uri(c.BaseUrl!.Trim());
        var m = RootPattern.Match(Uri.UnescapeDataString(uri.AbsolutePath));
        return new Target(new Uri(uri.GetLeftPart(UriPartial.Path).TrimEnd('/')), m.Groups["tenant"].Value, m.Groups["company"].Value);
    }

    // ---- sign-in ----

    private async Task<(string? Token, string? Error)> TokenAsync(ErpConnection c, Target t, CancellationToken ct)
    {
        var secret = string.IsNullOrEmpty(c.SecretName) ? null : _secrets.Get(c.SecretName);
        if (string.IsNullOrEmpty(_clientId)) return (null, "Business Central sign-in is not configured (Erp:BusinessCentral:ClientId).");
        if (string.IsNullOrEmpty(secret)) return (null, "The Business Central client secret was not found. Check the secret name and Key Vault.");
        var key = $"{t.TenantId}|{_clientId}|{c.SecretName}";
        await _tokenLock.WaitAsync(ct);
        try
        {
            if (_tokens.TryGetValue(key, out var cached) && cached.Expires > _now().AddMinutes(2)) return (cached.Token, null);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"https://{_loginHost}/{Uri.EscapeDataString(t.TenantId)}/oauth2/v2.0/token")
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "client_credentials", ["client_id"] = _clientId, ["client_secret"] = secret, ["scope"] = $"https://{Host}/.default",
                })
            };
            using var r = await _http.SendAsync(req, ct);
            var body = await r.Content.ReadAsStringAsync(ct);
            if (!r.IsSuccessStatusCode) return (null, $"Entra ID refused the sign-in ({(int)r.StatusCode}). Check the client id, secret and that the app is registered in Business Central.");
            using var doc = JsonDocument.Parse(body);
            var token = doc.RootElement.GetProperty("access_token").GetString()!;
            var seconds = doc.RootElement.TryGetProperty("expires_in", out var e) && e.TryGetInt32(out var s) ? s : 3000;
            _tokens[key] = (token, _now().AddSeconds(seconds));
            return (token, null);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException) { return (null, "Entra ID could not be reached or answered unexpectedly."); }
        finally { _tokenLock.Release(); }
    }

    private async Task<(HttpRequestMessage? Request, string? Error)> RequestAsync(HttpMethod method, Uri uri, ErpConnection c, Target t, CancellationToken ct)
    {
        var (token, err) = await TokenAsync(c, t, ct);
        if (token is null) return (null, err);
        var req = new HttpRequestMessage(method, uri);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return (req, null);
    }

    // ---- ping ----

    public async Task<string?> PingAsync(ErpConnection c, CancellationToken ct = default)
    {
        var t = Parse(c, out var err);
        if (t is null) return err;
        var (req, e) = await RequestAsync(HttpMethod.Get, t.Root, c, t, ct);
        if (req is null) return e;
        try
        {
            using var r = await _http.SendAsync(req, ct);
            return r.IsSuccessStatusCode ? null : r.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => $"Business Central refused access ({(int)r.StatusCode}). The Entra app must be registered in Business Central with permissions.",
                HttpStatusCode.NotFound => "Business Central did not find that environment or company. Check the address.",
                _ => $"Business Central answered {(int)r.StatusCode}.",
            };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) { return "Business Central could not be reached."; }
    }

    // ---- pulling ----

    /// <summary>
    /// Cursor for modified-since reads: "{lastModifiedDateTime}~{records already read at exactly that time}". The read uses "ge" plus a skip,
    /// so records sharing a timestamp across a page boundary are neither lost nor read twice.
    /// </summary>
    public static (string? Since, int Skip) ParseCursor(string? cursor)
    {
        if (string.IsNullOrEmpty(cursor)) return (null, 0);
        var i = cursor.LastIndexOf('~');
        var (since, skip) = i > 0 && int.TryParse(cursor[(i + 1)..], out var n) ? (cursor[..i], n) : (cursor, 0);
        // the value goes into a filter, so only a timestamp is ever accepted
        return DateTimeOffset.TryParse(since, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out _) && Regex.IsMatch(since, @"^[0-9T:.\-+Z]+$") ? (since, skip) : (null, 0);
    }

    public static string? NextCursor(string? cursor, List<string> stamps)
    {
        if (stamps.Count == 0) return null;
        var (since, skip) = ParseCursor(cursor);
        var last = stamps[^1];
        var atLast = stamps.Count(s => s == last);
        return $"{last}~{(last == since ? skip + atLast : atLast)}";
    }

    private static string? Str(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static decimal? Num(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : null;
    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private async Task<(List<JsonElement> Rows, string? Error)> GetRows(ErpConnection c, Target t, string query, CancellationToken ct)
    {
        var (req, err) = await RequestAsync(HttpMethod.Get, t.Entity(query), c, t, ct);
        if (req is null) return (new(), err);
        try
        {
            using var r = await _http.SendAsync(req, ct);
            if (!r.IsSuccessStatusCode) return (new(), $"Business Central answered {(int)r.StatusCode} for {query.Split('?')[0]}.");
            using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync(ct));
            // clone: the elements must outlive the document
            return (doc.RootElement.GetProperty("value").EnumerateArray().Select(x => x.Clone()).ToList(), null);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return (new(), "Business Central could not be reached."); }
        catch (Exception e) when (e is JsonException or KeyNotFoundException) { return (new(), $"Business Central returned data for {query.Split('?')[0]} in an unexpected shape."); }
    }

    private static string Modified(string? since) => since is null ? "" : $"lastModifiedDateTime ge {since}";

    private static string Query(string entity, string? filter, string? expand, string orderBy, int skip, string? select = null) =>
        $"{entity}?$top={PageSize}&$orderby={orderBy}" + (skip > 0 ? $"&$skip={skip}" : "") + (string.IsNullOrEmpty(filter) ? "" : $"&$filter={Uri.EscapeDataString(filter)}")
        + (expand is null ? "" : $"&$expand={expand}") + (select is null ? "" : $"&$select={select}");

    public async Task<PullResult<T>> PullAsync<T>(ErpConnection c, string entity, string? cursor, CancellationToken ct = default)
    {
        var t = Parse(c, out var err);
        if (t is null) return new(new(), null, err);
        object items; string? next; string? error;
        switch (entity)
        {
            case "products": (items, next, error) = await Products(c, t, cursor, ct); break;
            case "customers": (items, next, error) = await Customers(c, t, cursor, ct); break;
            case "sales": (items, next, error) = await Sales(c, t, cursor, ct); break;
            case "stock-levels": (items, next, error) = await StockLevels(c, t, cursor, ct); break;
            // Lot numbers and expiry dates are not in the standard API; goods receipts arrive by CSV or push (docs/business-central.md).
            default: return new(new(), null, null);
        }
        return new(items as List<T> ?? new(), next, error);
    }

    private async Task<(object, string?, string?)> Products(ErpConnection c, Target t, string? cursor, CancellationToken ct)
    {
        var (since, skip) = ParseCursor(cursor);
        var filter = "type eq 'Inventory'" + (since is null ? "" : $" and {Modified(since)}");
        var (rows, error) = await GetRows(c, t, Query("items", filter, null, "lastModifiedDateTime", skip), ct);
        if (error != null) return (new List<ErpProduct>(), null, error);
        var items = new List<ErpProduct>();
        foreach (var r in rows)
        {
            var code = Clean(Str(r, "number")); var name = Clean(Str(r, "displayName"));
            if (code is null || name is null) continue;
            // Business Central's item API has no reorder point; the category stands in for the therapeutic area
            items.Add(new ErpProduct(code, name, Clean(Str(r, "itemCategoryCode")), Num(r, "unitCost") is { } cost and >= 0 ? cost : null, null));
        }
        return (items, NextCursor(cursor, rows.Select(r => Str(r, "lastModifiedDateTime") ?? "").Where(s => s != "").ToList()), null);
    }

    private async Task<(object, string?, string?)> Customers(ErpConnection c, Target t, string? cursor, CancellationToken ct)
    {
        var (since, skip) = ParseCursor(cursor);
        var (rows, error) = await GetRows(c, t, Query("customers", since is null ? null : Modified(since), null, "lastModifiedDateTime", skip), ct);
        if (error != null) return (new List<ErpCustomer>(), null, error);
        var items = new List<ErpCustomer>();
        foreach (var r in rows)
        {
            var code = Clean(Str(r, "number")); var name = Clean(Str(r, "displayName"));
            if (code is null || name is null) continue;
            // Business Central's customer "type" is Company/Person, which says nothing about pharmacy or hospital, so it is not mapped
            items.Add(new ErpCustomer(code, name, null, Clean(Str(r, "city")), Clean(Str(r, "phoneNumber")), Clean(Str(r, "email"))));
        }
        return (items, NextCursor(cursor, rows.Select(r => Str(r, "lastModifiedDateTime") ?? "").Where(s => s != "").ToList()), null);
    }

    /// <summary>Sales cursor holds one position per source: <c>I={invoices};C={credit memos}</c>.</summary>
    public static (string? Invoices, string? CreditMemos) SplitSales(string? cursor)
    {
        string? i = null, m = null;
        foreach (var part in (cursor ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            if (part.StartsWith("I=")) i = part[2..]; else if (part.StartsWith("C=")) m = part[2..];
        }
        return (i, m);
    }

    private async Task<(object, string?, string?)> Sales(ErpConnection c, Target t, string? cursor, CancellationToken ct)
    {
        var (invCursor, memoCursor) = SplitSales(cursor);
        var items = new List<ErpSale>();
        string? newInv = invCursor, newMemo = memoCursor;
        foreach (var (entity, lines, dateField, sign, cur) in new[]
        {
            ("salesInvoices", "salesInvoiceLines", "invoiceDate", 1m, invCursor),
            ("salesCreditMemos", "salesCreditMemoLines", "creditMemoDate", -1m, memoCursor),
        })
        {
            var (since, skip) = ParseCursor(cur);
            // drafts are not sales yet
            var filter = "status ne 'Draft' and status ne 'In Review'" + (since is null ? "" : $" and {Modified(since)}");
            var (rows, error) = await GetRows(c, t, Query(entity, filter, lines, "lastModifiedDateTime", skip), ct);
            if (error != null) return (new List<ErpSale>(), null, error);
            foreach (var h in rows)
            {
                var number = Clean(Str(h, "number")); var account = Clean(Str(h, "customerNumber"));
                if (number is null || account is null || !DateOnly.TryParse(Str(h, dateField), CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)) continue;
                var currency = Clean(Str(h, "currencyCode")); // empty means the company's local currency
                if (!h.TryGetProperty(lines, out var ls) || ls.ValueKind != JsonValueKind.Array) continue;
                foreach (var l in ls.EnumerateArray())
                {
                    var item = Clean(Str(l, "lineObjectNumber"));
                    if (Str(l, "lineType") != "Item" || item is null || Num(l, "quantity") is not { } qty || Num(l, "netAmount") is not { } amount) continue;
                    var seq = l.TryGetProperty("sequence", out var sq) && sq.ValueKind == JsonValueKind.Number ? sq.GetInt32().ToString() : Str(l, "id") ?? "";
                    // the prefix keeps invoice and credit-memo numbers apart; credit memos are negative
                    items.Add(new ErpSale($"{(sign > 0 ? "INV" : "CM")}:{number}/{seq}", number, date, account, item, Math.Abs(qty) * sign, Math.Abs(amount) * sign, currency));
                }
            }
            var next = NextCursor(cur, rows.Select(r => Str(r, "lastModifiedDateTime") ?? "").Where(s => s != "").ToList());
            if (entity == "salesInvoices") newInv = next ?? newInv; else newMemo = next ?? newMemo;
        }
        if (items.Count == 0 && newInv == invCursor && newMemo == memoCursor) return (items, null, null);
        var combined = string.Join(';', new[] { newInv is null ? null : $"I={newInv}", newMemo is null ? null : $"C={newMemo}" }.Where(x => x != null));
        return (items, combined == (cursor ?? "") ? null : combined, null);
    }

    /// <summary>
    /// Stock is read as a full snapshot every time: an item's modified time does not change when stock moves, so "changed since" would miss it.
    /// Item totals only (no batches). When the last page is read the cursor is reset so the next pull starts again from the top.
    /// </summary>
    private async Task<(object, string?, string?)> StockLevels(ErpConnection c, Target t, string? cursor, CancellationToken ct)
    {
        var skip = int.TryParse(cursor, out var n) && n > 0 ? n : 0;
        var (rows, error) = await GetRows(c, t, Query("items", "type eq 'Inventory'", null, "number", skip, "number,inventory"), ct);
        if (error != null) return (new List<ErpStockLevel>(), null, error);
        var asOf = _now();
        var items = rows.Where(r => Clean(Str(r, "number")) != null && Num(r, "inventory") != null)
            .Select(r => new ErpStockLevel(Str(r, "number")!.Trim(), null, Num(r, "inventory")!.Value, asOf)).ToList();
        return (items, rows.Count >= PageSize ? (skip + rows.Count).ToString() : PullCursor.Reset, null);
    }

    // ---- sending ----

    public async Task<SendResult> SendAsync(ErpConnection c, OutboxMessage m, CancellationToken ct = default)
    {
        var t = Parse(c, out var err);
        if (t is null) return new(false, true, null, err);
        try
        {
            return m.Type == "purchase.requisition" ? await PurchaseOrder(c, t, m, ct) : await CustomApi(c, t, m, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { return new(false, false, null, "Business Central could not be reached."); }
    }

    private static SendResult Failure(HttpStatusCode code, string body)
    {
        var text = body.Trim(); if (text.Length > 300) text = text[..300];
        // other 4xx will never be accepted as it is; authentication problems are fixed by settings, so they are retried
        var permanent = (int)code is >= 400 and < 500 && code is not (HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests or HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden);
        return new(false, permanent, null, $"Business Central answered {(int)code}: {text}");
    }

    /// <summary>
    /// A purchase requisition becomes a draft purchase order (Business Central has no requisition document in its standard API).
    /// The vendor comes from <c>Erp:BusinessCentral:DefaultVendorNumber</c>; purchasing reviews and releases the draft.
    /// The header and its line are two calls: if the line fails, the empty header is removed so a retry does not leave a stray order.
    /// </summary>
    private async Task<SendResult> PurchaseOrder(ErpConnection c, Target t, OutboxMessage m, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_vendor)) return new(false, true, null, "No default vendor is set for purchase requisitions (Erp:BusinessCentral:DefaultVendorNumber).");
        using var p = JsonDocument.Parse(m.Payload);
        var root = p.RootElement;
        var item = Str(root, "itemCode"); var qty = Num(root, "quantity");
        if (item is null || qty is not > 0) return new(false, true, null, "The requisition has no item or quantity.");

        var (create, e1) = await RequestAsync(HttpMethod.Post, t.Entity("purchaseOrders"), c, t, ct);
        if (create is null) return new(false, false, null, e1);
        create.Content = Json(new { vendorNumber = _vendor });
        using var r1 = await _http.SendAsync(create, ct);
        var b1 = await r1.Content.ReadAsStringAsync(ct);
        if (!r1.IsSuccessStatusCode) return Failure(r1.StatusCode, b1);
        string id, number;
        try { using var d = JsonDocument.Parse(b1); id = d.RootElement.GetProperty("id").GetString()!; number = d.RootElement.GetProperty("number").GetString()!; }
        catch (Exception e) when (e is JsonException or KeyNotFoundException) { return new(false, false, null, "Business Central created an order but the answer was not understood."); }

        var line = new Dictionary<string, object?> { ["lineType"] = "Item", ["lineObjectNumber"] = item, ["quantity"] = qty };
        if (DateOnly.TryParse(Str(root, "neededBy"), CultureInfo.InvariantCulture, DateTimeStyles.None, out var needed)) line["expectedReceiptDate"] = needed.ToString("yyyy-MM-dd");
        var (add, e2) = await RequestAsync(HttpMethod.Post, t.Entity($"purchaseOrders({id})/purchaseOrderLines"), c, t, ct);
        if (add is null) { await TryDelete(c, t, id, ct); return new(false, false, null, e2); }
        add.Content = Json(line);
        using var r2 = await _http.SendAsync(add, ct);
        if (!r2.IsSuccessStatusCode)
        {
            var failure = Failure(r2.StatusCode, await r2.Content.ReadAsStringAsync(ct));
            await TryDelete(c, t, id, ct);
            return failure;
        }
        return new(true, false, number, null);
    }

    private async Task TryDelete(ErpConnection c, Target t, string orderId, CancellationToken ct)
    {
        try
        {
            var (req, _) = await RequestAsync(HttpMethod.Delete, t.Entity($"purchaseOrders({orderId})"), c, t, ct);
            if (req is null) return;
            req.Headers.TryAddWithoutValidation("If-Match", "*");
            using var _ = await _http.SendAsync(req, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { /* best effort */ }
    }

    /// <summary>
    /// Sample movements go to a small custom API page that DAS's Business Central partner adds (the standard API cannot post item journals):
    /// <c>POST .../api/{Erp:BusinessCentral:CustomApi}/companies({id})/sampleMovements</c> with <c>{ messageId, messageType, payload }</c>.
    /// A repeated messageId answers 409 or 200 and counts as delivered.
    /// </summary>
    private async Task<SendResult> CustomApi(ErpConnection c, Target t, OutboxMessage m, CancellationToken ct)
    {
        var (req, err) = await RequestAsync(HttpMethod.Post, t.Custom(_customApi, "sampleMovements"), c, t, ct);
        if (req is null) return new(false, false, null, err);
        req.Content = Json(new { messageId = m.Id.ToString(), messageType = m.Type, createdAt = m.CreatedAt, payload = m.Payload });
        using var r = await _http.SendAsync(req, ct);
        var body = await r.Content.ReadAsStringAsync(ct);
        if (r.StatusCode == HttpStatusCode.Conflict) return new(true, false, null, null); // already received
        if (!r.IsSuccessStatusCode) return Failure(r.StatusCode, body);
        string? reference = null;
        try { using var d = JsonDocument.Parse(body); reference = Clean(Str(d.RootElement, "number") ?? Str(d.RootElement, "reference")); } catch (JsonException) { /* body is optional */ }
        return new(true, false, reference, null);
    }

    private static StringContent Json(object o) => new(JsonSerializer.Serialize(o, ErpJson.Options), Encoding.UTF8, "application/json");
}

/// <summary>Chooses the connector for a tenant's connection by its provider.</summary>
public class ErpConnectorRouter : IErpConnector
{
    private readonly RestErpConnector _rest;
    private readonly BusinessCentralConnector _bc;
    private readonly NullErpConnector _none = new();

    public ErpConnectorRouter(RestErpConnector rest, BusinessCentralConnector bc) { _rest = rest; _bc = bc; }

    private IErpConnector For(ErpConnection c) => c.Provider switch { "rest" => _rest, BusinessCentralConnector.Provider => _bc, _ => _none };
    public Task<SendResult> SendAsync(ErpConnection c, OutboxMessage m, CancellationToken ct = default) => For(c).SendAsync(c, m, ct);
    public Task<PullResult<T>> PullAsync<T>(ErpConnection c, string entity, string? cursor, CancellationToken ct = default) => For(c).PullAsync<T>(c, entity, cursor, ct);
    public Task<string?> PingAsync(ErpConnection c, CancellationToken ct = default) => For(c).PingAsync(c, ct);
}

public static class PullCursor
{
    /// <summary>Returned by a connector as the next cursor to mean "this entity is complete; start from the beginning next time".</summary>
    public const string Reset = "\u0001reset";
}

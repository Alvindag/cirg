using System.Text.Json;
using System.Text.Json.Serialization;

namespace DasEngage.Api.Erp;

// The canonical data contract between DAS Engage and any ERP. An adapter (or the ERP itself) speaks this; see docs/erp-integration.md.

public record ErpProduct(string ItemCode, string Name, string? TherapeuticArea, decimal? StandardCost, int? ReorderLevel);
public record ErpCustomer(string AccountCode, string Name, string? Type, string? City, string? Phone, string? Email);
public record ErpSale(string ExternalId, string DocumentNumber, DateOnly Date, string AccountCode, string ItemCode, decimal Quantity, decimal NetAmount, string? Currency);
public record ErpGoodsReceipt(string ExternalId, string ItemCode, string BatchNumber, DateOnly ExpiryDate, int Quantity, string? RequisitionRef, DateTime? ReceivedAt);
public record ErpStockLevel(string ItemCode, string? BatchNumber, decimal Quantity, DateTime? AsOf);

public record ItemOutcome(string Key, string Status, string? Message);

public record ImportSummary(string Entity, string Source, int Created, int Updated, int Skipped, int Errors, List<ItemOutcome> Items)
{
    public bool Ok => Errors == 0;
}

/// <summary>A page of records pulled from an ERP gateway, with the cursor to continue from.</summary>
public record ErpPage<T>(List<T> Items, string? NextCursor);

public static class ErpJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
}

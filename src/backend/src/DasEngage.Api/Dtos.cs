using DasEngage.Domain;

namespace DasEngage.Api;

public record CustomerDto(Guid? Id, CustomerType Type, string Name, string? Specialty, Segment Segment,
    Guid? TerritoryId, Guid? ParentCustomerId, string? Phone, string? Email, string? Address, string? City,
    double? Latitude, double? Longitude, int TargetVisitsPerMonth, List<Guid>? ProductIds);

public record PlannedVisitDto(Guid? Id, Guid CustomerId, DateOnly PlannedDate, int Sequence, string? Objective);

public record CheckInDto(Guid? VisitId, Guid CustomerId, Guid? PlannedVisitId, DateTime? At,
    double? Latitude, double? Longitude, double? AccuracyM);

public record CheckOutDto(DateTime? At, double? Latitude, double? Longitude);

public record CallProductDto(Guid ProductId, string? Feedback);

public record CallReportDto(Guid? Id, Guid VisitId, string? Notes, string? Outcome, string? NextStep,
    string? VoiceNoteUrl, List<CallProductDto>? Products);

public record TaskDto(Guid? Id, Guid? AssignedToId, Guid? CustomerId, Guid? CallReportId, string Title, DateOnly? DueDate, string? Status = null);

public record GpsPingDto(Guid? Id, DateTime RecordedAt, double Latitude, double Longitude, double? AccuracyM);

public record SyncPushRequest(List<CheckInOp>? CheckIns, List<CallReportOp>? CallReports, List<TaskDto>? Tasks,
    List<GpsPingDto>? GpsPings, List<RequestDto>? SampleRequests = null, List<DistributionDto>? SampleDistributions = null,
    List<CustomerDto>? Customers = null, List<PlannedVisitOp>? PlannedVisits = null, List<Guid>? NotificationReads = null, List<OrderDto>? Orders = null);
/// <summary>A visit planned (or cancelled) on the device. Idempotent on the id.</summary>
public record PlannedVisitOp(Guid Id, Guid CustomerId, DateOnly PlannedDate, int Sequence, string? Objective, bool Cancelled = false);
public record CheckInOp(Guid VisitId, CheckInDto CheckIn, CheckOutDto? CheckOut);
public record CallReportOp(CallReportDto Report);

public record ProductEditDto(string Name, string? TherapeuticArea, decimal? StandardCost, int? ReorderLevel, int? SampleLimitPerCustomer, int? SampleLimitDays);

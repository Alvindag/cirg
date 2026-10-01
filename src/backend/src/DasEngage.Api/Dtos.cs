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
    List<GpsPingDto>? GpsPings, List<RequestDto>? SampleRequests = null, List<DistributionDto>? SampleDistributions = null);
public record CheckInOp(Guid VisitId, CheckInDto CheckIn, CheckOutDto? CheckOut);
public record CallReportOp(CallReportDto Report);

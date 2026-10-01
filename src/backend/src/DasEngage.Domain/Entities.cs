namespace DasEngage.Domain;

public enum UserRole { Rep, AreaManager, RegionalManager, NationalSalesManager, Marketing, KeyAccountManager, Executive, Admin }

public enum CustomerType { Doctor, Pharmacist, Hospital, Clinic, Pharmacy, Distributor, GovernmentInstitution }

public enum Segment { A, B, C, Unclassified }

public enum VisitStatus { Planned, InProgress, Completed, Missed, Cancelled }

public enum AttachmentKind { Photo, VoiceNote, Signature }

public enum BatchStatus { Active, Quarantined, Recalled }

public enum MovementType { Receipt, IssueToRep, ReturnFromRep, Distribution, WriteOff, Adjustment }

public enum SampleRequestStatus { Pending, Approved, Rejected, Fulfilled, Cancelled }

public enum AiFeature { Transcription, VisitSummary }

public enum AiStatus { Draft, Accepted, Rejected, Failed }

public enum OutboxStatus { Pending, Sent, DeadLetter }

public enum RequisitionStatus { Draft, Approved, Received, Rejected, Cancelled }

public enum FollowUpStatus { Open, Done, Cancelled }

/// <summary>High-volume or machine-written rows that are not individually audited (the audit log would drown in them).</summary>
public interface IUnaudited { }

/// <summary>Base for all tenant-owned, syncable rows. Ids are client-generatable (UUID) for offline creation.</summary>
public abstract class TenantEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TenantId { get; set; }
    public DateTime CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
    /// <summary>Soft delete; doubles as a tombstone for offline sync.</summary>
    public DateTime? DeletedAt { get; set; }
}

public class Tenant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public bool IsActive { get; set; } = true;
    /// <summary>The customer's Microsoft Entra directory (tenant) id; links incoming Entra tokens to this tenant.</summary>
    public string? ExternalTenantId { get; set; }
    /// <summary>Generative AI (transcription, summaries) is off until a tenant administrator opts in.</summary>
    public bool AiEnabled { get; set; }
}

public class Territory : TenantEntity
{
    public string Name { get; set; } = "";
    public string? Region { get; set; }
    public string? District { get; set; }
}

public class AppUser : TenantEntity
{
    /// <summary>Subject claim from the identity provider (Entra ID).</summary>
    public string ExternalId { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public UserRole Role { get; set; }
    public Guid? ManagerId { get; set; }
    public Guid? TerritoryId { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Product : TenantEntity
{
    public string Name { get; set; } = "";
    public string? Code { get; set; }
    public string? TherapeuticArea { get; set; }
    /// <summary>Standard unit cost from the ERP; values the samples given out.</summary>
    public decimal? StandardCost { get; set; }
    /// <summary>Warehouse sample stock below this triggers a purchase suggestion.</summary>
    public int? ReorderLevel { get; set; }
}

public class Customer : TenantEntity
{
    public CustomerType Type { get; set; }
    public string Name { get; set; } = "";
    public string? Specialty { get; set; }
    public Segment Segment { get; set; } = Segment.Unclassified;
    public Guid? TerritoryId { get; set; }
    /// <summary>For doctors/pharmacists: the hospital/clinic/pharmacy they are affiliated with.</summary>
    public Guid? ParentCustomerId { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? City { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    /// <summary>Target visits per month, driven by segment.</summary>
    public int TargetVisitsPerMonth { get; set; }
    /// <summary>The customer's account code in the ERP (links invoices to this customer).</summary>
    public string? ErpAccountCode { get; set; }
    public List<CustomerProductInterest> ProductInterests { get; set; } = new();
}

public class CustomerProductInterest : TenantEntity
{
    public Guid CustomerId { get; set; }
    public Guid ProductId { get; set; }
}

public class PlannedVisit : TenantEntity
{
    public Guid RepId { get; set; }
    public Guid CustomerId { get; set; }
    public DateOnly PlannedDate { get; set; }
    public int Sequence { get; set; }
    public VisitStatus Status { get; set; } = VisitStatus.Planned;
    public string? Objective { get; set; }
}

public class Visit : TenantEntity
{
    public Guid RepId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid? PlannedVisitId { get; set; }
    public DateTime CheckInAt { get; set; }
    public double? CheckInLat { get; set; }
    public double? CheckInLng { get; set; }
    public double? CheckInAccuracyM { get; set; }
    public DateTime? CheckOutAt { get; set; }
    public double? CheckOutLat { get; set; }
    public double? CheckOutLng { get; set; }
    /// <summary>Distance from the customer's recorded location at check-in; null if unknown.</summary>
    public double? DistanceFromCustomerM { get; set; }
    public bool? GeofenceOk { get; set; }
    public VisitStatus Status { get; set; } = VisitStatus.InProgress;
}

public class CallReport : TenantEntity
{
    public Guid VisitId { get; set; }
    public Guid RepId { get; set; }
    public Guid CustomerId { get; set; }
    public string? Notes { get; set; }
    public string? Outcome { get; set; }
    public string? NextStep { get; set; }
    public string? VoiceNoteUrl { get; set; }
    public List<CallReportProduct> Products { get; set; } = new();
}

public class CallReportProduct : TenantEntity
{
    public Guid CallReportId { get; set; }
    public Guid ProductId { get; set; }
    public string? Feedback { get; set; }
}

public class FollowUpTask : TenantEntity
{
    public Guid AssignedToId { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? CallReportId { get; set; }
    public string Title { get; set; } = "";
    public DateOnly? DueDate { get; set; }
    public FollowUpStatus Status { get; set; } = FollowUpStatus.Open;
}

public class GpsPing : TenantEntity
{
    public Guid RepId { get; set; }
    public DateTime RecordedAt { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double? AccuracyM { get; set; }
}

/// <summary>Append-only. Each entry hashes the previous one for tamper evidence.</summary>
public class AuditLog
{
    public long Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid? UserId { get; set; }
    public DateTime At { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public Guid EntityId { get; set; }
    public string? Changes { get; set; }
    public string? PrevHash { get; set; }
    public string Hash { get; set; } = "";
}

/// <summary>
/// A photo, voice note or signature captured during a visit. The file lives in blob storage; this row is the audited metadata.
/// For signatures, <see cref="RecordHash"/> binds signer, meaning, time, visit and image together (electronic-signature record).
/// </summary>
public class Attachment : TenantEntity
{
    public AttachmentKind Kind { get; set; }
    public Guid RepId { get; set; }
    public Guid VisitId { get; set; }
    public Guid? CallReportId { get; set; }
    public Guid CustomerId { get; set; }
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public string StorageKey { get; set; } = "";
    public DateTime CapturedAt { get; set; }
    public string? SignerName { get; set; }
    public string? Meaning { get; set; }
    public string? RecordHash { get; set; }
}

/// <summary>A manufacturing batch of a sample product. Expiry and status drive what may be issued or handed out.</summary>
public class SampleBatch : TenantEntity
{
    public Guid ProductId { get; set; }
    public string BatchNumber { get; set; } = "";
    public DateOnly ExpiryDate { get; set; }
    public BatchStatus Status { get; set; } = BatchStatus.Active;
    public string? StatusReason { get; set; }
}

/// <summary>
/// Immutable stock ledger. Stock is never edited: every change is a movement, and a balance is the sum of deltas for a
/// batch and holder (HolderId null = central warehouse, otherwise the rep carrying the stock).
/// </summary>
public class StockMovement : TenantEntity
{
    public Guid BatchId { get; set; }
    public Guid? HolderId { get; set; }
    public int Delta { get; set; }
    public MovementType Type { get; set; }
    /// <summary>The request or distribution this movement belongs to.</summary>
    public Guid? RefId { get; set; }
    public string? Note { get; set; }
    public DateTime OccurredAt { get; set; }
}

public class SampleRequest : TenantEntity
{
    public Guid RepId { get; set; }
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
    public int? ApprovedQuantity { get; set; }
    public SampleRequestStatus Status { get; set; } = SampleRequestStatus.Pending;
    public string? Notes { get; set; }
    public Guid? DecidedBy { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? DecisionNote { get; set; }
    public Guid? FulfilledBy { get; set; }
    public DateTime? FulfilledAt { get; set; }
}

/// <summary>Samples handed to a customer. The signature is an Attachment of kind Signature, which may arrive after this row (offline).</summary>
public class SampleDistribution : TenantEntity
{
    public Guid RepId { get; set; }
    public Guid? VisitId { get; set; }
    public Guid CustomerId { get; set; }
    public Guid ProductId { get; set; }
    public Guid BatchId { get; set; }
    public int Quantity { get; set; }
    public DateTime DistributedAt { get; set; }
    public Guid? SignatureAttachmentId { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// One call to a generative model (or its result). This is both the draft the rep reviews and the AI model-use register:
/// who used which model for what, when, how much, and whether a person accepted the output. Prompts are stored only as a hash.
/// </summary>
public class AiOutput : TenantEntity
{
    public Guid UserId { get; set; }
    public AiFeature Feature { get; set; }
    /// <summary>"Attachment" (transcription) or "Visit" (summary).</summary>
    public string SubjectType { get; set; } = "";
    public Guid SubjectId { get; set; }
    public AiStatus Status { get; set; } = AiStatus.Draft;
    /// <summary>Transcript text, or the summary as JSON. Always a draft until a person accepts it.</summary>
    public string Content { get; set; } = "";
    /// <summary>What the person actually accepted, if they changed it.</summary>
    public string? EditedContent { get; set; }
    public string Model { get; set; } = "";
    public string PromptHash { get; set; } = "";
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int LatencyMs { get; set; }
    public string? Error { get; set; }
    public DateTime? DecidedAt { get; set; }
}

/// <summary>How a tenant is connected to its ERP. The secret itself is never stored here, only the name of the secret in the vault/configuration.</summary>
public class ErpConnection : TenantEntity
{
    /// <summary>"rest" (an ERP gateway implementing the DAS Engage contract) or "none" (CSV and push only).</summary>
    public string Provider { get; set; } = "none";
    public string? BaseUrl { get; set; }
    public string? SecretName { get; set; }
    public bool Enabled { get; set; }
    public bool OutboundEnabled { get; set; }
    public bool PullEnabled { get; set; }
    public int PullIntervalMinutes { get; set; } = 60;
    public string Currency { get; set; } = "GHS";
    public DateTime? LastPullAt { get; set; }
    public string? LastError { get; set; }
    /// <summary>JSON: the last cursor received per entity, so a pull continues where it stopped.</summary>
    public string? Cursors { get; set; }
}

/// <summary>A credential for ERP middleware to push data in. Only a hash is stored; the key is shown once when created.</summary>
public class IntegrationKey : TenantEntity
{
    public string Name { get; set; } = "";
    public string Prefix { get; set; } = "";
    public string KeyHash { get; set; } = "";
    public DateTime? RevokedAt { get; set; }
    public DateTime? LastUsedAt { get; set; }
}

/// <summary>Transactional outbox: changes that must reach the ERP are written in the same transaction as the business change, then delivered with retries.</summary>
public class OutboxMessage : TenantEntity, IUnaudited
{
    public string Type { get; set; } = "";
    public string Payload { get; set; } = "";
    public OutboxStatus Status { get; set; } = OutboxStatus.Pending;
    public int Attempts { get; set; }
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public string? LastError { get; set; }
    public string? ExternalRef { get; set; }
    public DateTime? SentAt { get; set; }
}

/// <summary>One run of an import or export, for the integration log.</summary>
public class SyncRun : TenantEntity, IUnaudited
{
    public string Entity { get; set; } = "";
    /// <summary>push (middleware), pull (scheduled), csv (uploaded by a person).</summary>
    public string Source { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public int Errors { get; set; }
    public string? Message { get; set; }
}

/// <summary>An invoice (or credit note) line from the ERP.</summary>
public class SalesFact : TenantEntity, IUnaudited
{
    public string ExternalId { get; set; } = "";
    public string DocumentNumber { get; set; } = "";
    public DateOnly SaleDate { get; set; }
    public string AccountCode { get; set; } = "";
    public Guid? CustomerId { get; set; }
    public string ItemCode { get; set; } = "";
    public Guid? ProductId { get; set; }
    public decimal Quantity { get; set; }
    public decimal NetAmount { get; set; }
    public string Currency { get; set; } = "GHS";
}

/// <summary>Remembers ERP documents already applied (goods receipts), so a re-sent document does nothing.</summary>
public class ErpDocument : TenantEntity, IUnaudited
{
    public string Type { get; set; } = "";
    public string ExternalId { get; set; } = "";
    public string Result { get; set; } = "";
}

/// <summary>The ERP's view of warehouse sample stock, kept to reconcile against our ledger.</summary>
public class ErpStockSnapshot : TenantEntity, IUnaudited
{
    public string ItemCode { get; set; } = "";
    public Guid? ProductId { get; set; }
    public string? BatchNumber { get; set; }
    public decimal Quantity { get; set; }
    public DateTime AsOf { get; set; }
}

public class PurchaseRequisition : TenantEntity
{
    public Guid ProductId { get; set; }
    public int Quantity { get; set; }
    public DateOnly? NeededBy { get; set; }
    public string? Note { get; set; }
    public RequisitionStatus Status { get; set; } = RequisitionStatus.Draft;
    public Guid RequestedBy { get; set; }
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ErpReference { get; set; }
    public int ReceivedQuantity { get; set; }
    public string? DecisionNote { get; set; }
}

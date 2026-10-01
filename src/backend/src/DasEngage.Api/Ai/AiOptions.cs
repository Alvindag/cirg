namespace DasEngage.Api.Ai;

/// <summary>Settings under "Ai". Generative features need Enabled=true here AND the tenant's opt-in.</summary>
public class AiOptions
{
    public bool Enabled { get; set; }
    /// <summary>"azure" (Azure OpenAI) or "none".</summary>
    public string Provider { get; set; } = "none";
    public string? Endpoint { get; set; }
    public string ChatDeployment { get; set; } = "gpt-4o-mini";
    public string TranscriptionDeployment { get; set; } = "whisper";
    public string ApiVersion { get; set; } = "2024-06-01";
    /// <summary>For local development only. Production uses a managed identity (no key).</summary>
    public string? ApiKey { get; set; }
    public int DailyLimitPerUser { get; set; } = 40;
    /// <summary>Notes longer than this are cut before they are sent to the model.</summary>
    public int MaxInputChars { get; set; } = 6000;
    public int MaxAudioBytes { get; set; } = 25_000_000;
    /// <summary>Calls one rep can realistically make per month (about 8 a day on 20 working days). Used for territory balance.</summary>
    public int CallsPerRepPerMonth { get; set; } = 160;
}

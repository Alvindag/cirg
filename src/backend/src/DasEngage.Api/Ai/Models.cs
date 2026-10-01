using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.Options;

namespace DasEngage.Api.Ai;

public record ChatResult(string Content, int InputTokens, int OutputTokens);
public record TranscriptResult(string Text, string? Language);

/// <summary>The model could not be used (not configured, quota, outage, or unusable output). Never exposes provider details to the caller.</summary>
public class AiUnavailableException : Exception
{
    public int StatusCode { get; }
    public AiUnavailableException(string message, int statusCode = 503) : base(message) => StatusCode = statusCode;
}

public interface IChatModel
{
    string Deployment { get; }
    /// <summary>Asks for a JSON object answer with low randomness.</summary>
    Task<ChatResult> CompleteJsonAsync(string system, string user, CancellationToken ct = default);
}

public interface ITranscriber
{
    string Deployment { get; }
    Task<TranscriptResult> TranscribeAsync(Stream audio, string fileName, string contentType, string? language, CancellationToken ct = default);
}

/// <summary>Used when no provider is configured.</summary>
public class UnavailableModel : IChatModel, ITranscriber
{
    public string Deployment => "none";
    public Task<ChatResult> CompleteJsonAsync(string system, string user, CancellationToken ct = default) =>
        throw new AiUnavailableException("No AI provider is configured.");
    public Task<TranscriptResult> TranscribeAsync(Stream audio, string fileName, string contentType, string? language, CancellationToken ct = default) =>
        throw new AiUnavailableException("No AI provider is configured.");
}

/// <summary>Azure OpenAI over REST. Production authenticates with a managed identity; an api-key is for local development.</summary>
public class AzureOpenAi : IChatModel, ITranscriber
{
    private readonly HttpClient _http;
    private readonly AiOptions _o;
    private readonly TokenCredential? _credential;

    public AzureOpenAi(HttpClient http, IOptions<AiOptions> options, TokenCredential? credential = null)
    {
        _http = http; _o = options.Value;
        _credential = string.IsNullOrEmpty(_o.ApiKey) ? credential ?? new DefaultAzureCredential() : null;
        if (string.IsNullOrWhiteSpace(_o.Endpoint)) throw new InvalidOperationException("Ai:Endpoint is not configured.");
    }

    string IChatModel.Deployment => _o.ChatDeployment;
    string ITranscriber.Deployment => _o.TranscriptionDeployment;

    private Uri Url(string deployment, string operation) =>
        new($"{_o.Endpoint!.TrimEnd('/')}/openai/deployments/{Uri.EscapeDataString(deployment)}/{operation}?api-version={_o.ApiVersion}");

    private async Task Authorize(HttpRequestMessage req, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(_o.ApiKey)) { req.Headers.Add("api-key", _o.ApiKey); return; }
        var token = await _credential!.GetTokenAsync(new TokenRequestContext(new[] { "https://cognitiveservices.azure.com/.default" }), ct);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token.Token);
    }

    private static AiUnavailableException Map(HttpResponseMessage r) => r.StatusCode switch
    {
        HttpStatusCode.TooManyRequests => new AiUnavailableException("The AI service is busy. Try again in a minute.", 429),
        HttpStatusCode.BadRequest => new AiUnavailableException("The AI service declined this request (content filter or input too long).", 422),
        _ => new AiUnavailableException("The AI service is temporarily unavailable."),
    };

    public async Task<ChatResult> CompleteJsonAsync(string system, string user, CancellationToken ct = default)
    {
        var body = JsonSerializer.Serialize(new
        {
            messages = new object[] { new { role = "system", content = system }, new { role = "user", content = user } },
            temperature = 0.2,
            max_tokens = 900,
            response_format = new { type = "json_object" },
        });
        using var req = new HttpRequestMessage(HttpMethod.Post, Url(_o.ChatDeployment, "chat/completions")) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        await Authorize(req, ct);
        HttpResponseMessage r;
        try { r = await _http.SendAsync(req, ct); }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { throw new AiUnavailableException("The AI service is temporarily unavailable."); }
        using (r)
        {
            if (!r.IsSuccessStatusCode) throw Map(r);
            using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            var choice = root.GetProperty("choices")[0];
            if (choice.TryGetProperty("finish_reason", out var fr) && fr.GetString() == "content_filter")
                throw new AiUnavailableException("The AI service declined this request (content filter).", 422);
            var content = choice.GetProperty("message").GetProperty("content").GetString() ?? "";
            var usage = root.TryGetProperty("usage", out var u) ? u : default;
            return new ChatResult(content, usage.ValueKind == JsonValueKind.Object ? usage.GetProperty("prompt_tokens").GetInt32() : 0,
                usage.ValueKind == JsonValueKind.Object ? usage.GetProperty("completion_tokens").GetInt32() : 0);
        }
    }

    public async Task<TranscriptResult> TranscribeAsync(Stream audio, string fileName, string contentType, string? language, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        var file = new StreamContent(audio);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "file", fileName);
        form.Add(new StringContent("json"), "response_format");
        if (!string.IsNullOrWhiteSpace(language)) form.Add(new StringContent(language), "language");
        using var req = new HttpRequestMessage(HttpMethod.Post, Url(_o.TranscriptionDeployment, "audio/transcriptions")) { Content = form };
        await Authorize(req, ct);
        HttpResponseMessage r;
        try { r = await _http.SendAsync(req, ct); }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException) { throw new AiUnavailableException("The AI service is temporarily unavailable."); }
        using (r)
        {
            if (!r.IsSuccessStatusCode) throw Map(r);
            using var doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync(ct));
            return new TranscriptResult(doc.RootElement.GetProperty("text").GetString() ?? "", language);
        }
    }
}

using Azure.Identity;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace DasEngage.Infrastructure;

/// <summary>Where attachment files live. Keys are server-generated, never derived from client file names.</summary>
public interface IBlobStore
{
    Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default);
    /// <summary>Returns null when the blob does not exist.</summary>
    Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default);
}

/// <summary>Files on local disk: development and single-server installs.</summary>
public class LocalBlobStore : IBlobStore
{
    private readonly string _root;
    public LocalBlobStore(string root) { _root = Path.GetFullPath(root); Directory.CreateDirectory(_root); }

    private string PathFor(string key)
    {
        var full = Path.GetFullPath(Path.Combine(_root, key));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new ArgumentException("Invalid key.");
        return full;
    }

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        var path = PathFor(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var f = File.Create(path);
        await content.CopyToAsync(f, ct);
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var path = PathFor(key);
        return Task.FromResult<Stream?>(File.Exists(path) ? File.OpenRead(path) : null);
    }
}

/// <summary>Azure Blob Storage. Use Storage:AccountUrl with a managed identity in production (no secrets), or a connection string locally.</summary>
public class AzureBlobStore : IBlobStore
{
    private readonly BlobContainerClient _container;

    public AzureBlobStore(string? connectionString, string? accountUrl, string container)
    {
        var service = !string.IsNullOrEmpty(connectionString)
            ? new BlobServiceClient(connectionString)
            : new BlobServiceClient(new Uri(accountUrl ?? throw new InvalidOperationException("Storage:AccountUrl or Storage:ConnectionString is required.")),
                new DefaultAzureCredential());
        _container = service.GetBlobContainerClient(container);
        _container.CreateIfNotExists(PublicAccessType.None);
    }

    public async Task PutAsync(string key, Stream content, string contentType, CancellationToken ct = default) =>
        await _container.GetBlobClient(key).UploadAsync(content, new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } }, ct);

    public async Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var blob = _container.GetBlobClient(key);
        return await blob.ExistsAsync(ct) ? await blob.OpenReadAsync(cancellationToken: ct) : null;
    }
}

using System.Text.RegularExpressions;

namespace DasEngage.Api.Ai;

/// <summary>
/// Removes obvious personal identifiers before text leaves the system for a model.
/// This is a safety net, not a guarantee: free text can still contain names and other details, which is why outputs are
/// drafts, tenants must opt in, and reps are told not to dictate patient information.
/// </summary>
public static partial class Redactor
{
    [GeneratedRegex(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")] private static partial Regex Email();
    [GeneratedRegex(@"https?://\S+|www\.\S+")] private static partial Regex Url();
    // Ghana Card: GHA-123456789-0
    [GeneratedRegex(@"\bGHA-?\d{9}-?\d\b", RegexOptions.IgnoreCase)] private static partial Regex GhanaCard();
    // phone-like: starts with + or a leading 0, then digits possibly separated by spaces, dots, dashes or brackets
    [GeneratedRegex(@"(?<!\w)(?:\+\d|0\d)(?:[\s.\-()]?\d){6,13}(?!\w)")] private static partial Regex Phone();
    // long digit strings (account, card, ID numbers, phone numbers written without separators)
    [GeneratedRegex(@"(?<!\w)\d{9,}(?!\w)")] private static partial Regex LongNumber();
    [GeneratedRegex(@"^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$")] private static partial Regex DateLike();

    public static string Redact(string? text, IEnumerable<string?>? names = null)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var t = Email().Replace(text, "[email]");
        t = Url().Replace(t, "[link]");
        t = GhanaCard().Replace(t, "[id]");
        // 01-10-2026 looks like a phone number but is a date: leave dates alone
        t = Phone().Replace(t, m => DateLike().IsMatch(m.Value) ? m.Value : "[number]");
        t = LongNumber().Replace(t, "[number]");
        foreach (var name in (names ?? Array.Empty<string?>()).Where(n => !string.IsNullOrWhiteSpace(n)).OrderByDescending(n => n!.Length))
        {
            // the full name, and each part of it that is long enough to be a name rather than a title or initial
            t = Regex.Replace(t, Regex.Escape(name!.Trim()), "[name]", RegexOptions.IgnoreCase);
            foreach (var part in name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(p => p.Length >= 4 && !Titles.Contains(p.Trim('.').ToLowerInvariant())))
                t = Regex.Replace(t, $@"\b{Regex.Escape(part)}\b", "[name]", RegexOptions.IgnoreCase);
        }
        return t;
    }

    private static readonly HashSet<string> Titles = new() { "doctor", "prof", "professor", "pharm", "pharmacist", "hospital", "clinic", "pharmacy", "chemist", "chemists" };
}

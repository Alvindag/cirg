using DasEngage.Domain;

namespace DasEngage.Api.Ai;

/// <summary>What we know about a customer, gathered from visits, call reports, samples and tasks.</summary>
public record CustomerFacts(Guid Id, string Name, CustomerType Type, Segment Segment, int TargetVisitsPerMonth, int ProductInterestCount,
    double? Latitude, double? Longitude, Guid? TerritoryId,
    int Visits90, DateTime? LastVisitAt, IReadOnlyList<string?> RecentOutcomes, int SampleUnits90, int OpenTasks,
    /// <summary>Invoiced revenue in the last 90 days, from the ERP. Null when no ERP sales data exists at all (the factor is then left out).</summary>
    decimal? Revenue90 = null);

public record Factor(string Name, double Points, double Max, string Explanation);

public record CustomerScore(Guid CustomerId, string Name, int Potential, int Engagement, int Overall, string Status, string? SuggestedSegment, List<Factor> Factors);

/// <summary>
/// Transparent customer scoring. Every point can be traced to a factor, so a manager can see why a customer scores as they do.
/// Potential = how much the customer could matter (segment, product interest); Engagement = how healthy the relationship is
/// (recency, visit frequency against target, call outcomes, sample uptake).
/// </summary>
public static class CustomerScorer
{
    public static CustomerScore Score(CustomerFacts f, DateTime now)
    {
        var factors = new List<Factor>();

        double segmentBase = f.Segment switch { Segment.A => 85, Segment.B => 60, Segment.C => 35, _ => 25 };
        var interest = Math.Min(15, f.ProductInterestCount * 5);
        var potential = Math.Min(100, segmentBase + interest);

        double days = f.LastVisitAt is { } last ? Math.Max(0, (now - last).TotalDays) : double.PositiveInfinity;
        var recency = double.IsInfinity(days) ? 0 : 35 * Math.Clamp(1 - (days - 7) / (60 - 7), 0, 1);
        factors.Add(new Factor("Recency", Math.Round(recency, 1), 35, double.IsInfinity(days) ? "Never visited." : $"Last visited {(int)days} day(s) ago."));

        var expected = Math.Max(1, f.TargetVisitsPerMonth) * 3.0;
        var frequency = 30 * Math.Min(1, f.Visits90 / expected);
        factors.Add(new Factor("Visit frequency", Math.Round(frequency, 1), 30, $"{f.Visits90} visit(s) in 90 days against about {expected:0} expected."));

        double sentiment;
        string sentimentWhy;
        var outcomes = f.RecentOutcomes.Where(o => !string.IsNullOrWhiteSpace(o)).Take(5).ToList();
        if (outcomes.Count == 0) { sentiment = 10; sentimentWhy = "No call outcomes recorded yet."; }
        else
        {
            var avg = outcomes.Average(o => OutcomeWeight(o!));
            sentiment = 25 * avg;
            sentimentWhy = $"{outcomes.Count(o => OutcomeWeight(o!) >= 1)} positive of the last {outcomes.Count} call(s).";
        }
        factors.Add(new Factor("Call outcomes", Math.Round(sentiment, 1), 25, sentimentWhy));

        var samples = f.SampleUnits90 > 0 ? 10.0 : 0;
        factors.Add(new Factor("Sample uptake", samples, 10, f.SampleUnits90 > 0 ? $"{f.SampleUnits90} sample unit(s) given in 90 days." : "No samples given in 90 days."));

        // Buying is the strongest sign of a working relationship, once ERP invoices are available to say who buys.
        var purchases = 0.0;
        if (f.Revenue90 is { } revenue)
        {
            purchases = revenue > 0 ? 10 : 0;
            factors.Add(new Factor("Purchases", purchases, 10, revenue > 0 ? $"Invoiced {revenue:N0} in the last 90 days." : "No invoices in the last 90 days."));
        }

        var engagement = (int)Math.Min(100, Math.Round(recency + frequency + sentiment + samples + purchases));
        factors.Insert(0, new Factor("Potential", potential, 100, $"{f.Segment} segment{(f.ProductInterestCount > 0 ? $", {f.ProductInterestCount} product interest(s)" : "")}."));

        var overall = (int)Math.Round(0.4 * potential + 0.6 * engagement);
        var status = potential >= 60 && engagement < 40 ? "At risk"
            : overall >= 75 ? "Thriving"
            : overall >= 50 ? "Healthy"
            : "Needs attention";
        var suggested = overall >= 70 ? Segment.A : overall >= 45 ? Segment.B : Segment.C;
        return new CustomerScore(f.Id, f.Name, (int)potential, engagement, overall, status,
            f.Segment != Segment.Unclassified && suggested != f.Segment ? suggested.ToString() : null, factors);
    }

    internal static double OutcomeWeight(string outcome) => outcome.Trim().ToLowerInvariant() switch
    {
        "positive" => 1.0,
        "follow-up needed" => 0.6,
        "neutral" => 0.4,
        "negative" => 0.0,
        _ => 0.4,
    };
}

public record OpenTask(Guid Id, Guid? CustomerId, string Title, DateOnly? DueDate);
public record HeldStock(string ProductName, Guid ProductId, string BatchNumber, DateOnly Expiry, int Quantity);

public record NextAction(string Type, Guid? CustomerId, string Title, string Reason, int Priority, DateOnly? DueDate);

/// <summary>
/// Rule-based next best actions for a rep. The rules are explicit and each action says why it was suggested.
/// They are decision rules, not a trained model; they can be refined or replaced once there is enough outcome data (sales via ERP).
/// </summary>
public static class NextBestActions
{
    public static List<NextAction> Generate(IReadOnlyList<CustomerFacts> customers, IReadOnlyList<OpenTask> tasks, IReadOnlyList<HeldStock> stock, DateOnly today, DateTime now, int max = 10)
    {
        var byId = customers.ToDictionary(c => c.Id);
        var perCustomer = new Dictionary<Guid, NextAction>();
        var others = new List<NextAction>();

        void Offer(NextAction a)
        {
            if (a.CustomerId is not { } id) { others.Add(a); return; }
            if (!perCustomer.TryGetValue(id, out var cur) || a.Priority > cur.Priority) perCustomer[id] = a;
        }

        // 1. follow-ups that are due
        foreach (var t in tasks.Where(t => t.DueDate is { } d && d <= today))
        {
            var late = today.DayNumber - t.DueDate!.Value.DayNumber;
            var name = t.CustomerId is { } cid && byId.TryGetValue(cid, out var c) ? $" ({c.Name})" : "";
            Offer(new NextAction("FollowUp", t.CustomerId, $"Complete follow-up: {t.Title}{name}", late > 0 ? $"Overdue by {late} day(s)." : "Due today.", Math.Min(100, 90 + late), t.DueDate));
        }

        foreach (var c in customers)
        {
            var days = c.LastVisitAt is { } last ? (int)(now - last).TotalDays : int.MaxValue;
            var interval = c.TargetVisitsPerMonth > 0 ? 30.0 / c.TargetVisitsPerMonth : 45;
            var segWeight = c.Segment switch { Segment.A => 1.0, Segment.B => 0.75, Segment.C => 0.5, _ => 0.4 };
            var lastOutcome = c.RecentOutcomes.FirstOrDefault(o => !string.IsNullOrWhiteSpace(o))?.Trim().ToLowerInvariant();

            // 2. visit overdue against the target frequency
            if (days > interval * 1.25)
            {
                var overdueRatio = days == int.MaxValue ? 3 : Math.Min(3, days / interval);
                var why = days == int.MaxValue ? "Not visited yet." : $"Last visited {days} day(s) ago; target is about every {interval:0} days.";
                Offer(new NextAction("Visit", c.Id, $"Visit {c.Name}", why, (int)Math.Min(85, 35 + 20 * overdueRatio * segWeight), null));
            }

            // 3. a negative or open-ended last call that has gone quiet
            if (lastOutcome is "negative" or "follow-up needed" && days is > 14 and < int.MaxValue)
                Offer(new NextAction("Revisit", c.Id, $"Revisit {c.Name} to address earlier concerns", $"Last call outcome was \"{lastOutcome}\" {days} day(s) ago.", 65, null));

            // 4. positive call but no samples yet, and the rep carries stock
            if (lastOutcome == "positive" && c.SampleUnits90 == 0 && stock.Count > 0)
                Offer(new NextAction("OfferSamples", c.Id, $"Offer samples to {c.Name}", "The last call was positive and no samples have been given in 90 days.", 70, null));
        }

        // 5. stock that will expire soon: use it or return it
        foreach (var s in stock.Where(s => s.Quantity > 0 && s.Expiry.DayNumber - today.DayNumber is >= 0 and <= 60))
        {
            var left = s.Expiry.DayNumber - today.DayNumber;
            others.Add(new NextAction("ExpiringStock", null, $"Use or return {s.Quantity} × {s.ProductName} (batch {s.BatchNumber})",
                $"Expires in {left} day(s). Hand it out on visits or return it to the warehouse.", left <= 30 ? 85 : 75, s.Expiry));
        }

        return perCustomer.Values.Concat(others).OrderByDescending(a => a.Priority).ThenBy(a => a.Title).Take(max).ToList();
    }
}

public record ProductFacts(Guid ProductId, int Mentions180, int PositiveMentions180, bool Interested, int SampleUnits180,
    /// <summary>Invoice lines for this product in the last 180 days. Null when there is no ERP sales data.</summary>
    int? Purchases180 = null);

public record Opportunity(Guid CustomerId, string Name, string Likelihood, double Probability, List<Factor> Factors);

/// <summary>
/// Heuristic likelihood that a customer will engage with a product. The weights are fixed and uncalibrated: it ranks customers
/// for attention, it does not predict sales. It should be replaced by a model trained on ERP sales once that data is connected.
/// </summary>
public static class OpportunityScorer
{
    public static Opportunity Score(CustomerFacts f, ProductFacts p, DateTime now)
    {
        var factors = new List<Factor>();
        double z = -1.4;

        double Add(string name, double weight, double value, string why)
        {
            z += weight * value;
            factors.Add(new Factor(name, Math.Round(weight * value, 2), weight, why));
            return value;
        }

        Add("Stated interest", 1.2, p.Interested ? 1 : 0, p.Interested ? "Interested in this product." : "No recorded interest in this product.");
        var rate = p.Mentions180 > 0 ? (double)p.PositiveMentions180 / p.Mentions180 : 0.3;
        Add("Response when discussed", 1.6, rate, p.Mentions180 > 0 ? $"{p.PositiveMentions180} of {p.Mentions180} calls discussing it were positive." : "Never discussed on a call.");
        Add("Segment", 0.7, f.Segment switch { Segment.A => 1, Segment.B => 0.5, _ => 0 }, $"{f.Segment} segment.");
        var recent = f.LastVisitAt is { } l && (now - l).TotalDays <= 30;
        Add("Recent contact", 0.6, recent ? 1 : 0, recent ? "Visited in the last 30 days." : "Not visited in the last 30 days.");
        Add("Samples", 0.5, p.SampleUnits180 > 0 ? 1 : 0, p.SampleUnits180 > 0 ? $"{p.SampleUnits180} sample unit(s) given." : "No samples of this product given.");

        if (p.Purchases180 is { } bought) Add("Bought it before", 1.0, bought > 0 ? 1 : 0, bought > 0 ? $"{bought} invoice line(s) for this product in 180 days." : "No purchases of this product in 180 days.");

        var prob = 1 / (1 + Math.Exp(-z));
        return new Opportunity(f.Id, f.Name, prob >= 0.65 ? "High" : prob >= 0.4 ? "Medium" : "Low", Math.Round(prob, 2), factors);
    }
}

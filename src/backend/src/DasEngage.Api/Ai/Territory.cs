using DasEngage.Domain;

namespace DasEngage.Api.Ai;

public record TerritoryLoad(Guid TerritoryId, string Name, int Customers, int RequiredCallsPerMonth, int Reps, int CapacityPerMonth, double LoadRatio, string Status);

public record CustomerPoint(Guid Id, string Name, Guid TerritoryId, int TargetVisitsPerMonth, double? Latitude, double? Longitude);

public record MoveSuggestion(Guid CustomerId, string CustomerName, Guid FromTerritoryId, Guid ToTerritoryId, int CallsPerMonth, double DistanceToCurrentKm, double DistanceToNewKm);

public record BalanceResult(List<TerritoryLoad> Territories, List<MoveSuggestion> Suggestions);

public static class TerritoryBalancer
{
    public const double Overloaded = 1.1;
    public const double Underloaded = 0.6;

    /// <summary>
    /// Workload per territory (required calls against what the assigned reps can do) and a bounded list of customers to move from
    /// overloaded to underloaded territories. A customer moves to the territory whose centre (average position of its customers) is nearest.
    /// Suggestions only; nothing changes until a manager applies them.
    /// </summary>
    public static BalanceResult Balance(IReadOnlyList<(Guid Id, string Name)> territories, IReadOnlyDictionary<Guid, int> repsByTerritory,
        IReadOnlyList<CustomerPoint> customers, int callsPerRepPerMonth, int maxSuggestions = 50)
    {
        var loads = territories.Select(t =>
        {
            var cs = customers.Where(c => c.TerritoryId == t.Id).ToList();
            var required = cs.Sum(c => c.TargetVisitsPerMonth);
            var reps = repsByTerritory.GetValueOrDefault(t.Id);
            var capacity = reps * callsPerRepPerMonth;
            var ratio = capacity == 0 ? (required > 0 ? double.PositiveInfinity : 0) : (double)required / capacity;
            var status = reps == 0 && required > 0 ? "No rep assigned" : ratio > Overloaded ? "Overloaded" : ratio < Underloaded ? "Underloaded" : "Balanced";
            return new TerritoryLoad(t.Id, t.Name, cs.Count, required, reps, capacity, double.IsInfinity(ratio) ? 99 : Math.Round(ratio, 2), status);
        }).ToList();

        // working copy of required calls per territory
        var required2 = loads.ToDictionary(l => l.TerritoryId, l => l.RequiredCallsPerMonth);
        var capacity2 = loads.ToDictionary(l => l.TerritoryId, l => l.CapacityPerMonth);
        var moved = new HashSet<Guid>();
        var centres = territories.ToDictionary(t => t.Id, t => Centre(customers.Where(c => c.TerritoryId == t.Id).ToList()));
        var suggestions = new List<MoveSuggestion>();

        foreach (var from in loads.Where(l => l.Status is "Overloaded" or "No rep assigned").OrderByDescending(l => l.LoadRatio))
        {
            var candidates = customers.Where(c => c.TerritoryId == from.TerritoryId && c.Latitude != null && c.Longitude != null && c.TargetVisitsPerMonth > 0)
                .OrderBy(c => c.TargetVisitsPerMonth).ThenByDescending(c => centres[from.TerritoryId] is { } fc ? Geo.DistanceMeters(c.Latitude!.Value, c.Longitude!.Value, fc.Lat, fc.Lng) : 0);
            foreach (var c in candidates)
            {
                if (suggestions.Count >= maxSuggestions) break;
                if (Ratio(required2[from.TerritoryId], capacity2[from.TerritoryId]) <= 1.0 && from.Status != "No rep assigned") break;
                // destinations that have spare capacity after taking this customer, nearest centre first
                var target = loads.Where(l => l.TerritoryId != from.TerritoryId && capacity2[l.TerritoryId] > 0 && centres[l.TerritoryId] != null
                        && Ratio(required2[l.TerritoryId] + c.TargetVisitsPerMonth, capacity2[l.TerritoryId]) <= 1.0)
                    .Select(l => (l, d: Geo.DistanceMeters(c.Latitude!.Value, c.Longitude!.Value, centres[l.TerritoryId]!.Value.Lat, centres[l.TerritoryId]!.Value.Lng)))
                    .OrderBy(x => x.d).FirstOrDefault();
                if (target.l is null || moved.Contains(c.Id)) continue;
                var current = centres[from.TerritoryId] is { } cc ? Geo.DistanceMeters(c.Latitude!.Value, c.Longitude!.Value, cc.Lat, cc.Lng) : 0;
                suggestions.Add(new MoveSuggestion(c.Id, c.Name, from.TerritoryId, target.l.TerritoryId, c.TargetVisitsPerMonth, Math.Round(current / 1000, 1), Math.Round(target.d / 1000, 1)));
                required2[from.TerritoryId] -= c.TargetVisitsPerMonth;
                required2[target.l.TerritoryId] += c.TargetVisitsPerMonth;
                moved.Add(c.Id);
            }
        }
        return new BalanceResult(loads.OrderByDescending(l => l.LoadRatio).ToList(), suggestions);
    }

    private static double Ratio(int required, int capacity) => capacity == 0 ? double.PositiveInfinity : (double)required / capacity;

    private static (double Lat, double Lng)? Centre(IReadOnlyList<CustomerPoint> cs)
    {
        var geo = cs.Where(c => c.Latitude != null && c.Longitude != null).ToList();
        return geo.Count == 0 ? null : (geo.Average(c => c.Latitude!.Value), geo.Average(c => c.Longitude!.Value));
    }
}

public record RouteStop(Guid Id, double? Latitude, double? Longitude);

public record RoutePlan(List<Guid> Order, double OriginalKm, double OptimizedKm);

public static class RouteOptimizer
{
    /// <summary>
    /// Orders a day's stops to shorten the driving distance: nearest neighbour from the start, then 2-opt until no swap helps.
    /// Straight-line distance, so it is an approximation of road distance. Stops without coordinates keep their place at the end.
    /// </summary>
    public static RoutePlan Optimize(IReadOnlyList<RouteStop> stops, (double Lat, double Lng)? start)
    {
        var located = stops.Where(s => s.Latitude != null && s.Longitude != null).ToList();
        var unlocated = stops.Where(s => s.Latitude == null || s.Longitude == null).Select(s => s.Id).ToList();
        var original = Length(located, start);
        if (located.Count < 3 && start == null) return new RoutePlan(stops.Select(s => s.Id).ToList(), Km(original), Km(original));

        // nearest neighbour
        var remaining = located.ToList();
        var route = new List<RouteStop>();
        (double Lat, double Lng) here = start ?? (remaining[0].Latitude!.Value, remaining[0].Longitude!.Value);
        if (start == null) { route.Add(remaining[0]); remaining.RemoveAt(0); }
        while (remaining.Count > 0)
        {
            var next = remaining.OrderBy(s => Geo.DistanceMeters(here.Lat, here.Lng, s.Latitude!.Value, s.Longitude!.Value)).First();
            route.Add(next); remaining.Remove(next);
            here = (next.Latitude!.Value, next.Longitude!.Value);
        }

        // 2-opt
        var improved = true;
        for (var pass = 0; improved && pass < 50; pass++)
        {
            improved = false;
            for (var i = 0; i < route.Count - 1; i++)
                for (var j = i + 1; j < route.Count; j++)
                {
                    var candidate = route.Take(i).Concat(route.Skip(i).Take(j - i + 1).Reverse()).Concat(route.Skip(j + 1)).ToList();
                    if (Length(candidate, start) + 1e-6 < Length(route, start)) { route = candidate; improved = true; }
                }
        }

        var optimized = Length(route, start);
        // never make it worse than what the rep planned
        if (optimized > original) return new RoutePlan(located.Select(s => s.Id).Concat(unlocated).ToList(), Km(original), Km(original));
        return new RoutePlan(route.Select(s => s.Id).Concat(unlocated).ToList(), Km(original), Km(optimized));
    }

    private static double Km(double meters) => Math.Round(meters / 1000, 1);

    private static double Length(IReadOnlyList<RouteStop> route, (double Lat, double Lng)? start)
    {
        double total = 0;
        (double Lat, double Lng)? prev = start;
        foreach (var s in route)
        {
            var p = (Lat: s.Latitude!.Value, Lng: s.Longitude!.Value);
            if (prev is { } pr) total += Geo.DistanceMeters(pr.Lat, pr.Lng, p.Lat, p.Lng);
            prev = p;
        }
        return total;
    }
}

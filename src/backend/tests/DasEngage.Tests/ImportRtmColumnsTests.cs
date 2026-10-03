using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace DasEngage.Tests;

/// <summary>The customer file can also carry the route-to-market tags (channel and kind of outlet), in plain words or internal names.</summary>
public class ImportRtmColumnsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _f;
    public ImportRtmColumnsTests(ApiFactory f) => _f = f;

    private const string Header = "type,name,city,channel,outlet_class\n";

    private static async Task<JsonElement> Import(HttpClient c, string csv, string query = "dryRun=false")
    {
        var r = await c.PostAsync($"/api/v1/customers/import?{query}", new StringContent(csv, Encoding.UTF8, "text/csv"));
        Assert.True(r.IsSuccessStatusCode, $"{(int)r.StatusCode} {await r.Content.ReadAsStringAsync()}");
        return await r.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task<Dictionary<string, (string Channel, string Class)>> Tags(HttpClient c) =>
        (await c.GetFromJsonAsync<JsonElement>("/api/v1/customers?pageSize=200")).GetProperty("items").EnumerateArray()
            .ToDictionary(x => x.GetProperty("name").GetString()!, x => (x.GetProperty("channel").GetString()!, x.GetProperty("outletClass").GetString()!));

    private HttpClient Admin() => _f.ClientFor(Guid.NewGuid(), Guid.NewGuid(), "Admin");

    [Fact]
    public async Task Plain_labels_and_internal_names_both_work_and_blank_means_not_tagged()
    {
        var c = Admin();
        var res = await Import(c, Header +
            "Pharmacy,Ernest Chemists,Accra,Van sales,Independent pharmacy\n" +
            "Hospital,Korle Bu,Accra,MedicalSales,TeachingHospital\n" +
            "Pharmacy,Kumasi Wholesale,Kumasi,Distributor / wholesaler,Retail pharmacy chain\n" +
            "Pharmacy,Corner OTC,Tema,walk-in,OTC shop\n" +
            "Clinic,Quiet Clinic,Tema,,\n");
        Assert.Equal(5, res.GetProperty("created").GetInt32());
        var t = await Tags(c);
        Assert.Equal(("VanSales", "IndependentPharmacy"), t["Ernest Chemists"]);
        Assert.Equal(("MedicalSales", "TeachingHospital"), t["Korle Bu"]);
        Assert.Equal(("Distributor", "PharmacyChain"), t["Kumasi Wholesale"]);
        Assert.Equal(("WalkIn", "OtcShop"), t["Corner OTC"]);
        Assert.Equal(("Unassigned", "Unclassified"), t["Quiet Clinic"]);
    }

    [Fact]
    public async Task An_unknown_channel_or_kind_is_reported_on_its_row_and_nothing_else_is_blocked()
    {
        var c = Admin();
        var res = await Import(c, Header + "Pharmacy,Good One,Accra,Van sales,OTC shop\nPharmacy,Bad Channel,Accra,Camel,OTC shop\nPharmacy,Bad Kind,Accra,Van sales,Kiosk\n");
        Assert.Equal(1, res.GetProperty("created").GetInt32());
        Assert.Equal(2, res.GetProperty("errors").GetInt32());
        var messages = string.Join("|", res.GetProperty("rows").EnumerateArray().Select(r => r.GetProperty("message").GetString()));
        Assert.Contains("Unknown channel 'Camel'", messages);
        Assert.Contains("Unknown outlet class 'Kiosk'", messages);
        Assert.Single(await Tags(c));
    }

    [Fact]
    public async Task Updating_existing_customers_applies_the_tags_and_leaves_blank_cells_alone()
    {
        var c = Admin();
        await Import(c, "type,name,city\nPharmacy,Ernest Chemists,Accra\nPharmacy,Quiet Pharmacy,Tema\n");
        var res = await Import(c, Header + "Pharmacy,Ernest Chemists,Accra,Van sales,Independent pharmacy\nPharmacy,Quiet Pharmacy,Tema,,\n", "dryRun=false&onDuplicate=update");
        Assert.Equal(2, res.GetProperty("updated").GetInt32());
        var t = await Tags(c);
        Assert.Equal(("VanSales", "IndependentPharmacy"), t["Ernest Chemists"]);
        Assert.Equal(("Unassigned", "Unclassified"), t["Quiet Pharmacy"]);

        await Import(c, Header + "Pharmacy,Ernest Chemists,Accra,,OTC shop\n", "dryRun=false&onDuplicate=update"); // only the kind changes
        Assert.Equal(("VanSales", "OtcShop"), (await Tags(c))["Ernest Chemists"]);
    }
}

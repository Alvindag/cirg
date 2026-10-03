using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DasEngage.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SecondarySales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SecondarySales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    DistributorId = table.Column<Guid>(type: "uuid", nullable: false),
                    OutletId = table.Column<Guid>(type: "uuid", nullable: true),
                    OutletName = table.Column<string>(type: "text", nullable: false),
                    SaleDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ItemCode = table.Column<string>(type: "text", nullable: false),
                    ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    NetAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SecondarySales", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SecondarySales_TenantId_DistributorId_SaleDate",
                table: "SecondarySales",
                columns: new[] { "TenantId", "DistributorId", "SaleDate" });

            migrationBuilder.CreateIndex(
                name: "IX_SecondarySales_TenantId_ExternalId",
                table: "SecondarySales",
                columns: new[] { "TenantId", "ExternalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SecondarySales_TenantId_OutletId_SaleDate",
                table: "SecondarySales",
                columns: new[] { "TenantId", "OutletId", "SaleDate" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SecondarySales");
        }
    }
}

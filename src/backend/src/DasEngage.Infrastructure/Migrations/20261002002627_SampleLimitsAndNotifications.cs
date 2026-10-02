using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DasEngage.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SampleLimitsAndNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SampleLimitDays",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SampleLimitPerCustomer",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: true),
                    RefId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SampleDistributions_TenantId_CustomerId_ProductId_Distribut~",
                table: "SampleDistributions",
                columns: new[] { "TenantId", "CustomerId", "ProductId", "DistributedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_TenantId_UserId_ReadAt",
                table: "Notifications",
                columns: new[] { "TenantId", "UserId", "ReadAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Notifications");

            migrationBuilder.DropIndex(
                name: "IX_SampleDistributions_TenantId_CustomerId_ProductId_Distribut~",
                table: "SampleDistributions");

            migrationBuilder.DropColumn(
                name: "SampleLimitDays",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "SampleLimitPerCustomer",
                table: "Products");
        }
    }
}

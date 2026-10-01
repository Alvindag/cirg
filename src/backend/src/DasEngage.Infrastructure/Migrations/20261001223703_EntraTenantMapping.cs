using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DasEngage.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EntraTenantMapping : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExternalTenantId",
                table: "Tenants",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_ExternalTenantId",
                table: "Tenants",
                column: "ExternalTenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Tenants_ExternalTenantId",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ExternalTenantId",
                table: "Tenants");
        }
    }
}

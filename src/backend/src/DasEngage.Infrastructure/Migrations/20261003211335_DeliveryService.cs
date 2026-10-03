using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DasEngage.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryService : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DeliveredInFull",
                table: "Orders",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PromisedAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShortfallNote",
                table: "Orders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeliveredInFull",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PromisedAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ShortfallNote",
                table: "Orders");
        }
    }
}

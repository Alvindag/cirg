/// Turns received messages into item journal lines. Run it from the Job Queue (object type Codeunit, ID 50100) or with "Process now" on the message list.
/// The lines are NOT posted: purchasing/warehouse staff review and post the journals. A message that cannot be turned into lines is marked "Needs review" with the reason.
codeunit 50100 "DAS Sample Processor"
{
    trigger OnRun()
    begin
        ProcessPending();
    end;

    procedure ProcessPending()
    var
        Msg: Record "DAS Sample Message";
        Id: Guid;
    begin
        Msg.SetRange(Status, Msg.Status::Received);
        if Msg.FindSet() then
            repeat
                Id := Msg."Message Id";
                ProcessOne(Id);
            until Msg.Next() = 0;
    end;

    local procedure ProcessOne(Id: Guid)
    var
        Msg: Record "DAS Sample Message";
    begin
        Commit(); // Codeunit.Run inside "if" needs the previous work committed; a failure then rolls back only this message
        Msg.Get(Id);
        if Codeunit.Run(Codeunit::"DAS Sample Journal Builder", Msg) then
            exit;
        Msg.Get(Id);
        Msg.Status := Msg.Status::"Needs Review";
        Msg."Error Text" := CopyStr(GetLastErrorText(), 1, MaxStrLen(Msg."Error Text"));
        Msg.Modify();
    end;

    /// Sets a message back to "Received" so the next run tries it again (after fixing the setup, rep location or item).
    procedure Retry(var Msg: Record "DAS Sample Message")
    begin
        if Msg.FindSet(true) then
            repeat
                if Msg.Status = Msg.Status::"Needs Review" then begin
                    Msg.Status := Msg.Status::Received;
                    Msg."Error Text" := '';
                    Msg.Modify();
                end;
            until Msg.Next() = 0;
    end;
}

codeunit 50101 "DAS Sample Journal Builder"
{
    TableNo = "DAS Sample Message";

    var
        Setup: Record "DAS Engage Setup";
        MsgDocNo: Code[20];

    trigger OnRun()
    var
        Body: JsonObject;
        Kind: Text;
    begin
        if not Body.ReadFrom(Rec.GetPayload()) then
            Error('The message payload is not valid JSON.');
        Setup.Get();
        Setup.TestField("Main Location");
        MsgDocNo := Rec."Document No.";
        Kind := LowerCase(Rec."Message Type");

        case Kind of
            'sample.issue':
                Issue(Body);
            'sample.return':
                Return(Body);
            'sample.distribution':
                Distribution(Body);
            'sample.adjustment':
                Adjustment(Body);
            else
                Error('Unknown message type %1.', Rec."Message Type");
        end;

        Rec.Status := Rec.Status::Processed;
        Rec."Error Text" := '';
        Rec."Processed At" := CurrentDateTime();
        Rec.Modify();
    end;

    // ---- the four movements ----

    /// Warehouse -> rep: a transfer line per batch in the reclassification journal.
    local procedure Issue(Body: JsonObject)
    var
        Tok: JsonToken;
        Line: JsonToken;
        RepLoc: Code[10];
        Day: Date;
    begin
        RepLoc := RepLocation(Body);
        Day := DayOf(Body, 'issuedAt');
        if not Body.Get('lines', Tok) or not Tok.IsArray() then
            Error('The issue has no lines.');
        foreach Line in Tok.AsArray() do
            Transfer(Setup."Main Location", RepLoc, Line.AsObject(), Day, 'Samples issued to ' + Str(Body, 'repName'));
    end;

    /// Rep -> warehouse.
    local procedure Return(Body: JsonObject)
    begin
        Transfer(RepLocation(Body), Setup."Main Location", Body, DayOf(Body, 'at'), 'Samples returned by ' + Str(Body, 'repId'));
    end;

    /// Samples handed to a customer leave the rep's location (negative adjustment, so the ERP's stock and cost reflect it).
    local procedure Distribution(Body: JsonObject)
    begin
        NegativeAdjustment(RepLocation(Body), Body, Dec(Body, 'quantity'), DayOf(Body, 'distributedAt'),
            'Sample to ' + Str(Body, 'customerAccountCode') + ' ' + Str(Body, 'customerName'));
    end;

    /// Write-offs and corrections. Reductions become negative adjustments; an increase needs an expiry date the message does not carry, so a person enters it.
    local procedure Adjustment(Body: JsonObject)
    var
        Loc: Code[10];
        Delta: Decimal;
    begin
        Delta := Dec(Body, 'delta');
        if Delta >= 0 then
            Error('An increase of stock (%1) must be entered by hand because it needs an expiry date.', Delta);
        if Str(Body, 'location') = 'warehouse' then
            Loc := Setup."Main Location"
        else
            Loc := RepLocation(Body);
        NegativeAdjustment(Loc, Body, -Delta, DayOf(Body, 'at'), CopyStr(Str(Body, 'kind') + ': ' + Str(Body, 'reason'), 1, 100));
    end;

    // ---- journal lines ----

    local procedure Transfer(FromLoc: Code[10]; ToLoc: Code[10]; Line: JsonObject; Day: Date; Description: Text)
    var
        Item: Record Item;
        Jnl: Record "Item Journal Line";
        Qty: Decimal;
    begin
        Setup.TestField("Reclass Template");
        Setup.TestField("Reclass Batch");
        Qty := Dec(Line, 'quantity');
        FindItem(Item, Str(Line, 'itemCode'));
        NewLine(Jnl, Setup."Reclass Template", Setup."Reclass Batch", Day);
        Jnl.Validate("Entry Type", Jnl."Entry Type"::Transfer);
        Jnl.Validate("Item No.", Item."No.");
        Jnl.Validate("Location Code", FromLoc);
        Jnl.Validate("New Location Code", ToLoc);
        Jnl.Validate(Quantity, Qty);
        Finish(Jnl, Description);
        AssignLot(Jnl, Item, Str(Line, 'batchNumber'), Qty, true);
    end;

    local procedure NegativeAdjustment(Loc: Code[10]; Line: JsonObject; Qty: Decimal; Day: Date; Description: Text)
    var
        Item: Record Item;
        Jnl: Record "Item Journal Line";
    begin
        Setup.TestField("Consumption Template");
        Setup.TestField("Consumption Batch");
        FindItem(Item, Str(Line, 'itemCode'));
        NewLine(Jnl, Setup."Consumption Template", Setup."Consumption Batch", Day);
        Jnl.Validate("Entry Type", Jnl."Entry Type"::"Negative Adjmt.");
        Jnl.Validate("Item No.", Item."No.");
        Jnl.Validate("Location Code", Loc);
        Jnl.Validate(Quantity, Qty);
        Finish(Jnl, Description);
        AssignLot(Jnl, Item, Str(Line, 'batchNumber'), Qty, false);
    end;

    local procedure NewLine(var Jnl: Record "Item Journal Line"; Template: Code[10]; Batch: Code[10]; Day: Date)
    var
        Last: Record "Item Journal Line";
    begin
        Last.SetRange("Journal Template Name", Template);
        Last.SetRange("Journal Batch Name", Batch);
        Jnl.Init();
        Jnl."Journal Template Name" := Template;
        Jnl."Journal Batch Name" := Batch;
        if Last.FindLast() then
            Jnl."Line No." := Last."Line No." + 10000
        else
            Jnl."Line No." := 10000;
        Jnl.Insert(true);
        Jnl.Validate("Posting Date", Day);
    end;

    local procedure Finish(var Jnl: Record "Item Journal Line"; Description: Text)
    begin
        Jnl."Document No." := MsgDocNo;
        Jnl.Description := CopyStr(Description, 1, MaxStrLen(Jnl.Description));
        if Setup."Reason Code" <> '' then
            Jnl."Reason Code" := Setup."Reason Code";
        Jnl.Modify(true);
    end;

    /// Ties the line to the batch (lot) number. Quantities leaving a location are negative in the reservation entry.
    /// Items without a lot tracking code are left alone. NOTE: written without a compiler; the first thing to do in a sandbox is to compile and post a test journal.
    local procedure AssignLot(Jnl: Record "Item Journal Line"; Item: Record Item; Lot: Text; Qty: Decimal; IsTransfer: Boolean)
    var
        Res: Record "Reservation Entry";
    begin
        if Item."Item Tracking Code" = '' then
            exit;
        if Lot = '' then
            Error('Item %1 is lot tracked but the message has no batch number.', Item."No.");
        Res.Init();
        Res."Item No." := Item."No.";
        Res."Location Code" := Jnl."Location Code";
        Res."Reservation Status" := Res."Reservation Status"::Prospect;
        Res.Positive := false;
        Res."Source Type" := Database::"Item Journal Line";
        Res."Source Subtype" := Jnl."Entry Type".AsInteger();
        Res."Source ID" := Jnl."Journal Template Name";
        Res."Source Batch Name" := Jnl."Journal Batch Name";
        Res."Source Ref. No." := Jnl."Line No.";
        Res."Item Tracking" := Res."Item Tracking"::"Lot No.";
        Res."Lot No." := CopyStr(Lot, 1, MaxStrLen(Res."Lot No."));
        Res."Qty. per Unit of Measure" := Jnl."Qty. per Unit of Measure";
        Res.Quantity := -Qty;
        Res."Quantity (Base)" := -Qty * Jnl."Qty. per Unit of Measure";
        Res."Qty. to Handle (Base)" := Res."Quantity (Base)";
        Res."Qty. to Invoice (Base)" := Res."Quantity (Base)";
        Res."Shipment Date" := Jnl."Posting Date";
        Res."Creation Date" := WorkDate();
        Res."Created By" := CopyStr(UserId(), 1, MaxStrLen(Res."Created By"));
        if IsTransfer then
            Res."New Lot No." := Res."Lot No."; // a location transfer keeps the lot
        Res.Insert();
    end;

    // ---- lookups and JSON ----

    local procedure FindItem(var Item: Record Item; ItemCode: Text)
    begin
        if not Item.Get(CopyStr(ItemCode, 1, MaxStrLen(Item."No."))) then
            Error('Item %1 does not exist in Business Central.', ItemCode);
    end;

    local procedure RepLocation(Body: JsonObject): Code[10]
    var
        Rep: Record "DAS Rep Location";
        RepId: Guid;
    begin
        if not Evaluate(RepId, '{' + Str(Body, 'repId') + '}') then
            Error('The message has no sales rep.');
        if not Rep.Get(RepId) then
            Error('No location is set for sales rep %1 (%2). Add it under DAS Rep Locations, then retry.', Str(Body, 'repName'), RepId);
        Rep.TestField("Location Code");
        exit(Rep."Location Code");
    end;

    local procedure DayOf(Body: JsonObject; Name: Text): Date
    var
        Day: Date;
        Value: Text;
    begin
        Value := Str(Body, Name);
        // ISO timestamp: only the date part is needed, and "yyyy-mm-dd" is the XML date format
        if (StrLen(Value) < 10) or not Evaluate(Day, CopyStr(Value, 1, 10), 9) then
            Error('The message has no valid date in %1.', Name);
        exit(Day);
    end;

    local procedure Str(Body: JsonObject; Name: Text): Text
    var
        Tok: JsonToken;
    begin
        if not Body.Get(Name, Tok) or not Tok.IsValue() or Tok.AsValue().IsNull() then
            exit('');
        exit(Tok.AsValue().AsText());
    end;

    local procedure Dec(Body: JsonObject; Name: Text): Decimal
    var
        Tok: JsonToken;
    begin
        if not Body.Get(Name, Tok) or not Tok.IsValue() or Tok.AsValue().IsNull() then
            Error('The message has no %1.', Name);
        exit(Tok.AsValue().AsDecimal());
    end;
}

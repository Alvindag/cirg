table 50100 "DAS Sample Message"
{
    Caption = 'DAS Sample Message';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Message Id"; Guid) { Caption = 'Message Id'; }
        field(2; "Message Type"; Code[30]) { Caption = 'Message Type'; }
        field(3; "Created At"; DateTime) { Caption = 'Created At'; }
        field(4; Payload; Blob) { Caption = 'Payload'; }
        field(5; Status; Enum "DAS Sample Message Status") { Caption = 'Status'; }
        field(6; "Document No."; Code[20]) { Caption = 'Document No.'; }
        field(7; "Error Text"; Text[250]) { Caption = 'Error'; }
        field(8; "Processed At"; DateTime) { Caption = 'Processed At'; }
    }

    keys
    {
        key(PK; "Message Id") { Clustered = true; }
        key(ByStatus; Status, "Created At") { }
    }

    procedure SetPayload(Value: Text)
    var
        OutS: OutStream;
    begin
        Clear(Payload);
        Payload.CreateOutStream(OutS, TextEncoding::UTF8);
        OutS.WriteText(Value);
    end;

    procedure GetPayload() Result: Text
    var
        InS: InStream;
        Line: Text;
    begin
        CalcFields(Payload);
        if not Payload.HasValue() then
            exit('');
        Payload.CreateInStream(InS, TextEncoding::UTF8);
        while not InS.EOS() do begin
            InS.ReadText(Line);
            Result += Line;
        end;
    end;

    /// "DAS-" plus the first 16 characters of the message id: unique per message, fits Code[20], and is the document number on the journal lines.
    procedure DocumentNoFor(Id: Guid): Code[20]
    begin
        exit(CopyStr('DAS-' + CopyStr(DelChr(Format(Id), '=', '{}-'), 1, 16), 1, 20));
    end;
}

table 50101 "DAS Engage Setup"
{
    Caption = 'DAS Engage Setup';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Primary Key"; Code[10]) { Caption = 'Primary Key'; }
        field(2; "Main Location"; Code[10])
        {
            Caption = 'Main (sample) warehouse location';
            TableRelation = Location;
        }
        field(3; "Consumption Template"; Code[10])
        {
            Caption = 'Item journal template (consumption)';
            TableRelation = "Item Journal Template" where(Type = const(Item));
        }
        field(4; "Consumption Batch"; Code[10])
        {
            Caption = 'Item journal batch (consumption)';
            TableRelation = "Item Journal Batch".Name where("Journal Template Name" = field("Consumption Template"));
        }
        field(5; "Reclass Template"; Code[10])
        {
            Caption = 'Reclassification journal template (transfers)';
            TableRelation = "Item Journal Template" where(Type = const(Transfer));
        }
        field(6; "Reclass Batch"; Code[10])
        {
            Caption = 'Reclassification journal batch (transfers)';
            TableRelation = "Item Journal Batch".Name where("Journal Template Name" = field("Reclass Template"));
        }
        field(7; "Reason Code"; Code[10])
        {
            Caption = 'Reason code (optional)';
            TableRelation = "Reason Code";
        }
    }

    keys
    {
        key(PK; "Primary Key") { Clustered = true; }
    }
}

table 50102 "DAS Rep Location"
{
    Caption = 'DAS Rep Location';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Rep Id"; Guid) { Caption = 'Rep Id (from DAS Engage)'; }
        field(2; "Rep Name"; Text[100]) { Caption = 'Rep name'; }
        field(3; "Location Code"; Code[10])
        {
            Caption = 'Location holding this rep''s samples';
            TableRelation = Location;
        }
    }

    keys
    {
        key(PK; "Rep Id") { Clustered = true; }
    }
}

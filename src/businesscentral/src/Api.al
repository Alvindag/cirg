/// The endpoint DAS Engage calls: POST .../api/das/engage/v1.0/companies({id})/sampleMovements
/// It only records the message (idempotent on messageId) and answers quickly; the journal lines are made by "DAS Sample Processor".
page 50100 "DAS Sample Movements"
{
    PageType = API;
    APIPublisher = 'das';
    APIGroup = 'engage';
    APIVersion = 'v1.0';
    EntityName = 'sampleMovement';
    EntitySetName = 'sampleMovements';
    SourceTable = "DAS Sample Message";
    ODataKeyFields = "Message Id";
    DelayedInsert = true;
    InsertAllowed = true;
    ModifyAllowed = false;
    DeleteAllowed = false;
    Extensible = false;

    layout
    {
        area(Content)
        {
            repeater(Group)
            {
                field(messageId; Rec."Message Id") { Caption = 'messageId'; }
                field(messageType; Rec."Message Type") { Caption = 'messageType'; }
                field(createdAt; Rec."Created At") { Caption = 'createdAt'; }
                field(payload; PayloadText) { Caption = 'payload'; }
                // The reference DAS Engage stores; it is also the document number on the journal lines.
                field(number; Rec."Document No.") { Caption = 'number'; Editable = false; }
                field(status; Rec.Status) { Caption = 'status'; Editable = false; }
            }
        }
    }

    var
        PayloadText: Text;

    trigger OnAfterGetRecord()
    begin
        PayloadText := Rec.GetPayload();
    end;

    trigger OnInsertRecord(BelowxRec: Boolean): Boolean
    var
        Existing: Record "DAS Sample Message";
        Payload: JsonObject;
    begin
        // A repeat of a message already received (DAS Engage retries): answer with the stored one, store nothing.
        if Existing.Get(Rec."Message Id") then begin
            Rec := Existing;
            exit(false);
        end;

        if IsNullGuid(Rec."Message Id") then
            Error('messageId is required.');
        if not (Rec."Message Type" in ['SAMPLE.ISSUE', 'SAMPLE.DISTRIBUTION', 'SAMPLE.ADJUSTMENT', 'SAMPLE.RETURN']) then
            Error('Unknown messageType %1.', Rec."Message Type");
        if not Payload.ReadFrom(PayloadText) then
            Error('payload must be a JSON object, as a string.');

        Rec.SetPayload(PayloadText);
        Rec."Document No." := Rec.DocumentNoFor(Rec."Message Id");
        Rec.Status := Rec.Status::Received;
        exit(true);
    end;
}

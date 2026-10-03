page 50101 "DAS Sample Messages"
{
    Caption = 'DAS Sample Messages';
    PageType = List;
    ApplicationArea = All;
    UsageCategory = Lists;
    SourceTable = "DAS Sample Message";
    Editable = false;
    SourceTableView = sorting("Created At") order(descending);

    layout
    {
        area(Content)
        {
            repeater(Group)
            {
                field("Created At"; Rec."Created At") { ApplicationArea = All; }
                field("Message Type"; Rec."Message Type") { ApplicationArea = All; }
                field(Status; Rec.Status) { ApplicationArea = All; StyleExpr = StatusStyle; }
                field("Document No."; Rec."Document No.") { ApplicationArea = All; }
                field("Error Text"; Rec."Error Text") { ApplicationArea = All; }
                field("Processed At"; Rec."Processed At") { ApplicationArea = All; }
            }
        }
    }

    actions
    {
        area(Processing)
        {
            action(ProcessNow)
            {
                Caption = 'Process now';
                ApplicationArea = All;
                Image = Process;
                ToolTip = 'Create item journal lines for the messages that are waiting.';

                trigger OnAction()
                var
                    Processor: Codeunit "DAS Sample Processor";
                begin
                    Processor.ProcessPending();
                    CurrPage.Update(false);
                end;
            }
            action(RetrySelected)
            {
                Caption = 'Retry selected';
                ApplicationArea = All;
                Image = Redo;
                ToolTip = 'Put the selected messages that need review back in the queue (after fixing the setup, rep location or item).';

                trigger OnAction()
                var
                    Selected: Record "DAS Sample Message";
                    Processor: Codeunit "DAS Sample Processor";
                begin
                    CurrPage.SetSelectionFilter(Selected);
                    Processor.Retry(Selected);
                    CurrPage.Update(false);
                end;
            }
            action(ShowPayload)
            {
                Caption = 'Show payload';
                ApplicationArea = All;
                Image = ViewDetails;

                trigger OnAction()
                begin
                    Message(Rec.GetPayload());
                end;
            }
        }
    }

    var
        StatusStyle: Text;

    trigger OnAfterGetRecord()
    begin
        case Rec.Status of
            Rec.Status::Processed:
                StatusStyle := 'Favorable';
            Rec.Status::"Needs Review":
                StatusStyle := 'Unfavorable';
            else
                StatusStyle := 'Standard';
        end;
    end;
}

page 50102 "DAS Engage Setup"
{
    Caption = 'DAS Engage Setup';
    PageType = Card;
    ApplicationArea = All;
    UsageCategory = Administration;
    SourceTable = "DAS Engage Setup";
    InsertAllowed = false;
    DeleteAllowed = false;

    layout
    {
        area(Content)
        {
            group(General)
            {
                field("Main Location"; Rec."Main Location") { ApplicationArea = All; }
                field("Reason Code"; Rec."Reason Code") { ApplicationArea = All; }
            }
            group(Journals)
            {
                field("Consumption Template"; Rec."Consumption Template") { ApplicationArea = All; }
                field("Consumption Batch"; Rec."Consumption Batch") { ApplicationArea = All; }
                field("Reclass Template"; Rec."Reclass Template") { ApplicationArea = All; }
                field("Reclass Batch"; Rec."Reclass Batch") { ApplicationArea = All; }
            }
        }
    }

    trigger OnOpenPage()
    begin
        Rec.Reset();
        if not Rec.Get() then begin
            Rec.Init();
            Rec.Insert();
        end;
    end;
}

page 50103 "DAS Rep Locations"
{
    Caption = 'DAS Rep Locations';
    PageType = List;
    ApplicationArea = All;
    UsageCategory = Administration;
    SourceTable = "DAS Rep Location";

    layout
    {
        area(Content)
        {
            repeater(Group)
            {
                field("Rep Id"; Rec."Rep Id") { ApplicationArea = All; }
                field("Rep Name"; Rec."Rep Name") { ApplicationArea = All; }
                field("Location Code"; Rec."Location Code") { ApplicationArea = All; }
            }
        }
    }
}

permissionset 50100 "DAS ENGAGE"
{
    Caption = 'DAS Engage integration';
    Assignable = true;

    Permissions =
        tabledata "DAS Sample Message" = RIMD,
        tabledata "DAS Engage Setup" = RIMD,
        tabledata "DAS Rep Location" = RIMD,
        tabledata "Item Journal Line" = RIMD,
        tabledata "Item Journal Batch" = R,
        tabledata "Item Journal Template" = R,
        tabledata "Reservation Entry" = RIMD,
        tabledata Item = R,
        tabledata Location = R,
        tabledata "Reason Code" = R,
        page "DAS Sample Movements" = X,
        page "DAS Sample Messages" = X,
        page "DAS Engage Setup" = X,
        page "DAS Rep Locations" = X,
        codeunit "DAS Sample Processor" = X,
        codeunit "DAS Sample Journal Builder" = X;
}

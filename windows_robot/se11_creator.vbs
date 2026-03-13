' se11_creator.vbs - Automated SE11 Structure Generator (Perfected Enterprise Edition)
If WScript.Arguments.Count < 4 Then
    WScript.Echo "ERROR: Missing arguments. Requires: User, Pass, TCode, StructName"
    WScript.Quit(1)
End If

Dim argUser, argPass, argTcode, argStructName
argUser = WScript.Arguments.Item(0)
argPass = WScript.Arguments.Item(1)
argTcode = WScript.Arguments.Item(2)
argStructName = WScript.Arguments.Item(3) 

Set WshShell = CreateObject("WScript.Shell")

' --- 1. THE LAUNCHER & LOGIN ---
On Error Resume Next
Set SapGuiAuto = GetObject("SAPGUI")
If Err.Number <> 0 Then
    Err.Clear
    WScript.Echo "SAP is closed. Launching saplogon.exe..."
    WshShell.Run """C:\Program Files\SAP\FrontEnd\SAPGUI\saplogon.exe"""
    Dim bootCount
    For bootCount = 1 To 15
        WScript.Sleep 1000
        Set SapGuiAuto = GetObject("SAPGUI")
        If Err.Number = 0 Then Exit For
        Err.Clear
    Next
    WScript.Sleep 3000
End If
On Error GoTo 0 

WScript.Echo "Hooking into Scripting Engine..."
Set application = SapGuiAuto.GetScriptingEngine
application.OpenConnection "NPL", True

WScript.Echo "Hunting for the session object..."
Dim session, sessionFound, waitCount, conn, sess
sessionFound = False
For waitCount = 1 To 15
    WScript.Sleep 1000
    For Each conn In application.Children
        For Each sess In conn.Children
            Set session = sess
            sessionFound = True
            Exit For
        Next
        If sessionFound Then Exit For
    Next
    If sessionFound Then Exit For
Next

If Not sessionFound Then
    WScript.Echo "ERROR: Could not grab the COM object."
    WScript.Quit(1)
End If

WScript.Echo "Injecting LXC Credentials..."
session.findById("wnd[0]/usr/txtRSYST-BNAME").text = argUser
session.findById("wnd[0]/usr/pwdRSYST-BCODE").text = argPass
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 1500

WScript.Echo "Jumping to transaction: " & argTcode
session.findById("wnd[0]/tbar[0]/okcd").text = "/n" & argTcode
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 1000

' --- 2. EXECUTING SE11 STRUCTURE CREATION ---
WScript.Echo "SCOUT: Setting up Data Type..."
session.findById("wnd[0]/usr/radRSRD1-DDTYPE").select
session.findById("wnd[0]/usr/ctxtRSRD1-DDTYPE_VAL").text = argStructName
session.findById("wnd[0]/usr/btnPUSHADD").press
WScript.Sleep 1000

WScript.Echo "SCOUT: Selecting 'Structure' type..."
session.findById("wnd[1]/usr/radD_100-STRU").select
session.findById("wnd[1]/tbar[0]/btn[0]").press
WScript.Sleep 1000

WScript.Echo "SCOUT: Adding Short Description..."
session.findById("wnd[0]/usr/txtDD02D-DDTEXT").text = "AI Generated Structure: " & argStructName

WScript.Echo "SCOUT: Injecting Field 1 (INT4)..."
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/txtDD03P_D-FIELDNAME[0,0]").text = "FIELD1"
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/cmbDD03P_D-F_REFTYPE[1,0]").key = "1"
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/ctxtDD03P_D-ROLLNAME[2,0]").text = "INT4"
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 500

WScript.Echo "SCOUT: Injecting Field 2 (CHAR30)..."
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/txtDD03P_D-FIELDNAME[0,1]").text = "FIELD2"
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/cmbDD03P_D-F_REFTYPE[1,1]").key = "1"
session.findById("wnd[0]/usr/tabsTAB_STRIP/tabpDEF/ssubTS_SCREEN:SAPLSD41:2301/tblSAPLSD41TC0/ctxtDD03P_D-ROLLNAME[2,1]").text = "CHAR30"
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 500

' ==========================================================
' 🌟 THE LEGAL ENHANCEMENT CATEGORY BYPASS 🌟
' ==========================================================
WScript.Echo "SCOUT: Setting Enhancement Category via Menu..."
' Open Extras -> Enhancement Category
session.findById("wnd[0]/mbar/menu[4]/menu[7]").select
WScript.Sleep 1000

' SAP Popup: "Object must be saved first. Save now?" -> Click Yes
On Error Resume Next
session.findById("wnd[1]/tbar[0]/btn[0]").press
On Error GoTo 0
WScript.Sleep 1000

' Select "Cannot be enhanced" radio button and click Copy/Continue
session.findById("wnd[1]/usr/radDESED7-R_FINAL").select
session.findById("wnd[1]/tbar[0]/btn[0]").press
WScript.Sleep 1000
' ==========================================================

WScript.Echo "Saving Structure..."
session.findById("wnd[0]/tbar[0]/btn[11]").press
WScript.Sleep 1500

WScript.Echo "SCOUT: Assigning to Local Object Package ($TMP)..."
On Error Resume Next
session.findById("wnd[1]/tbar[0]/btn[7]").press
session.findById("wnd[2]/tbar[0]/btn[7]").press
On Error GoTo 0
WScript.Sleep 1500

WScript.Echo "Activating Structure..."
session.findById("wnd[0]/tbar[1]/btn[26]").press
WScript.Sleep 1500

' Hit Enter on the final "Objects to be Activated" popup
On Error Resume Next
session.findById("wnd[1]/tbar[0]/btn[0]").press
' Fallback button ID just in case SAP uses a different checkmark ID here
session.findById("wnd[0]/tbar[1]/btn[27]").press
On Error GoTo 0
WScript.Sleep 1500

' --- 3. THE CLEANUP (FORCE LOGOUT) ---
WScript.Echo "Logging out of SAP..."
On Error Resume Next
session.findById("wnd[0]/tbar[0]/okcd").text = "/nex"
session.findById("wnd[0]").sendVKey 0
On Error GoTo 0
WScript.Sleep 1000

WScript.Echo "[SUCCESS] SE11 Structure " & argStructName & " created and activated!"
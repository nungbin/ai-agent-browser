' surgeon.vbs - The Final Production Robot
If WScript.Arguments.Count < 5 Then
    WScript.Echo "ERROR: Missing arguments."
    WScript.Quit(1)
End If

Dim argUser, argPass, argTcode, argTargetUser, argTargetPass
argUser = WScript.Arguments.Item(0)
argPass = WScript.Arguments.Item(1)
argTcode = WScript.Arguments.Item(2)
argTargetUser = WScript.Arguments.Item(3)
argTargetPass = WScript.Arguments.Item(4)

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

' --- 2. SCOUTS & SWATTERS ---
Function FindFieldByIdFragment(rootNode, idFragment)
    Dim childNode, foundId
    foundId = ""
    On Error Resume Next
    For Each childNode In rootNode.Children
        If InStr(UCase(childNode.Id), UCase(idFragment)) > 0 Then
            If childNode.Type = "GuiTextField" Or childNode.Type = "GuiPasswordField" Or childNode.Type = "GuiComboBox" Or childNode.Type = "GuiCTextField" Then
                FindFieldByIdFragment = childNode.Id
                Exit Function
            End If
        End If
        Err.Clear
        If childNode.Children.Count > 0 Then
            foundId = FindFieldByIdFragment(childNode, idFragment)
            If foundId <> "" Then
                FindFieldByIdFragment = foundId
                Exit Function
            End If
        End If
    Next
End Function

Sub SmartSwatter()
    Dim i, popup
    For i = 1 To 5
        On Error Resume Next
        Set popup = session.findById("wnd[1]")
        If Err.Number <> 0 Then
            Err.Clear
            On Error GoTo 0
            Exit Sub
        End If
        Err.Clear
        
        WScript.Echo "  -> Popup detected! Firing Kill Shot (Attempt " & i & ")..."
        session.findById("wnd[1]/usr/btnBUTTON_1").press
        session.findById("wnd[1]/usr/btnSPOP-OPTION1").press
        session.findById("wnd[1]/tbar[0]/btn[0]").press
        popup.sendVKey 0
        
        WScript.Sleep 1000 
    Next
    WScript.Echo "❌ FATAL ERROR: Popup refused to die!"
    WScript.Quit(1)
End Sub


' --- 3. EXECUTING THE SU01 CREATION ---
Dim fieldId

WScript.Echo "SCOUT: Finding 'User' field..."
fieldId = FindFieldByIdFragment(session.findById("wnd[0]"), "SUID_ST_BNAME-BNAME")
If fieldId <> "" Then session.findById(fieldId).text = argTargetUser ' <--- DYNAMIC INJECTION
session.findById("wnd[0]").sendVKey 8 ' F8 (Create)
WScript.Sleep 1500 

WScript.Echo "SCOUT: Checking for Entry Popups..."
SmartSwatter() 

WScript.Echo "SCOUT: Waking up main window..."
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 1500

WScript.Echo "SCOUT: Finding 'Last name' field..."
fieldId = FindFieldByIdFragment(session.findById("wnd[0]"), "PERSON_NAME-NAME_LAST")
If fieldId <> "" Then session.findById(fieldId).text = "TEST_USER"

' --- THE ABSOLUTE TAB JUMP ---
WScript.Echo "SCOUT: Forcing Navigation to 'Logon Data' Tab..."
On Error Resume Next
session.findById("wnd[0]/usr/tabsTABSTRIP1/tabpLOGO").select
If Err.Number <> 0 Then WScript.Echo "  -> ERROR clicking tabpLOGO!"
Err.Clear
On Error GoTo 0
WScript.Sleep 1500 ' Wait for the DOM to completely redraw

WScript.Echo "SCOUT: Hunting Passwords by ID Fragment..."
fieldId = FindFieldByIdFragment(session.findById("wnd[0]"), "PASSWORD_EXT-PASSWORD")
If fieldId <> "" Then 
    session.findById(fieldId).text = argTargetPass ' <--- DYNAMIC INJECTION
    WScript.Echo "  -> Injected Password 1!"
Else
    WScript.Echo "  -> ERROR: Could not find Password 1 box."
End If

fieldId = FindFieldByIdFragment(session.findById("wnd[0]"), "PASSWORD_EXT-PASSWORD2")
If fieldId <> "" Then 
    session.findById(fieldId).text = argTargetPass ' <--- DYNAMIC INJECTION
    WScript.Echo "  -> Injected Password 2!"
End If

WScript.Echo "SCOUT: Hunting User Type by ID Fragment..."
fieldId = FindFieldByIdFragment(session.findById("wnd[0]"), "LOGONDATA-USTYP")
If fieldId <> "" Then 
    session.findById(fieldId).key = "S" 
    WScript.Echo "  -> Set User Type to Service!"
End If

WScript.Echo "Validating Logon Data..."
session.findById("wnd[0]").sendVKey 0
WScript.Sleep 1000

' --- THE ABSOLUTE TAB JUMP ---
WScript.Echo "SCOUT: Forcing Navigation to 'Profiles' Tab..."
On Error Resume Next
session.findById("wnd[0]/usr/tabsTABSTRIP1/tabpPROF").select
WScript.Sleep 1000
WScript.Echo "Injecting SAP_ALL profile..."
session.findById("wnd[0]/usr/tabsTABSTRIP1/tabpPROF/ssubMAINAREA:SAPLSUU5:0400/tblSAPLSUU5TC_PROFILES/ctxtUSPROF-PROFN[0,0]").text = "SAP_ALL"
On Error GoTo 0

WScript.Echo "Saving User..."
session.findById("wnd[0]/tbar[0]/btn[11]").press ' Save button
WScript.Sleep 1500

WScript.Echo "SCOUT: Checking for Save Warnings..."
SmartSwatter()

WScript.Echo "✅ SUCCESS! User " & argTargetUser & " processing complete!" ' <--- DYNAMIC MESSAGE
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")

' 1. Check for the Payload File from Linux
strPayloadFile = "C:\SAP_Bots\payload.txt"

If objFSO.FileExists(strPayloadFile) Then
    ' Read the instructions
    Set objFile = objFSO.OpenTextFile(strPayloadFile, 1)
    strLine = objFile.ReadLine
    objFile.Close
    
    ' SECURE SHRED: Delete the file immediately so passwords don't sit on the disk
    objFSO.DeleteFile(strPayloadFile)

    ' ==========================================
    ' SANITIZER: Remove literal double quotes left by Windows CMD
    ' ==========================================
    strLine = Replace(strLine, """", "")

    ' Parse the payload (Format: SYSTEM|CLIENT|USER|PASSWORD|TCODE)
    arrArgs = Split(strLine, "|")
    sysID = arrArgs(0)
    sapClient = arrArgs(1)
    sapUser = arrArgs(2)
    sapPass = arrArgs(3)
    tcode = UCase(arrArgs(4)) ' Ensure uppercase for file matching

    ' 2. Launch SAP and Login seamlessly using sapshcut
    sapPath = """C:\Program Files\SAP\FrontEnd\SAPGUI\sapshcut.exe"""
    cmd = sapPath & " -system=" & sysID & " -client=" & sapClient & " -user=" & sapUser & " -pw=" & sapPass & " -command=" & tcode
    
    ' Run the login command visibly
    objShell.Run cmd, 1, False

    ' Wait for SAP GUI to open and process login (adjust time if your SAP is slow)
    WScript.Sleep 5000 

    ' 3. DYNAMIC ROUTING: Check the Script Library for the requested T-Code
    strLibraryScript = "C:\SAP_Bots\scripts\" & tcode & ".vbs"

    If objFSO.FileExists(strLibraryScript) Then
        ' Execute the specific T-Code script!
        ' The 'True' flag makes the master script wait until the sub-script finishes.
        objShell.Run "wscript.exe """ & strLibraryScript & """", 1, True
    Else
        ' Optional: Log or alert that no automation exists for this T-Code yet
        ' WScript.Echo "Notice: SAP logged in, but no custom script found at " & strLibraryScript
    End If
End If
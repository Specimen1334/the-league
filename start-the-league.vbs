' start-the-league.vbs
Option Explicit

Dim fso, shell, root
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Root = folder containing this script
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

' --- CONFIG ---
Dim token, apiUrl, username
token = "superadmin-bootstrap-123"   ' change this to any strong string you like
apiUrl = "http://localhost:4000"     ' adjust if your API runs on another port
username = "Admin"                   ' your existing username
' --------------

' Set env var for THIS script process (child processes inherit it)
shell.Environment("PROCESS")("BOOTSTRAP_ADMIN_TOKEN") = token

' Start API
shell.Run "cmd /k npm run dev_api", 1, False

' Wait for API to be ready (poll /health)
If Not WaitForHealth(apiUrl & "/health", 30000) Then
  MsgBox "API did not become healthy within 30 seconds. Bootstrap skipped.", vbExclamation, "TheLeague"
Else
  ' Bootstrap superadmin
  Dim resp
  resp = BootstrapSuperadmin(apiUrl & "/admin/bootstrap/superadmin", token, username)
  MsgBox resp, vbInformation, "TheLeague Bootstrap"
End If

' Start Web
shell.Run "cmd /k npm run dev_web", 1, False


' --- Helpers ---

Function WaitForHealth(url, timeoutMs)
  Dim http, startTime
  startTime = Timer

  Do
    On Error Resume Next
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    http.Open "GET", url, False
    http.Send

    If Err.Number = 0 Then
      If http.Status = 200 Then
        WaitForHealth = True
        Exit Function
      End If
    End If
    On Error GoTo 0

    WScript.Sleep 500
  Loop While ((Timer - startTime) * 1000) < timeoutMs

  WaitForHealth = False
End Function


Function BootstrapSuperadmin(url, token, username)
  Dim http, body
  body = "{""username"":""" & username & """}"

  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.Open "POST", url, False
  http.SetRequestHeader "Content-Type", "application/json"
  http.SetRequestHeader "x-bootstrap-token", token
  http.Send body

  If Err.Number <> 0 Then
    BootstrapSuperadmin = "Bootstrap call failed: " & Err.Description
    Exit Function
  End If
  On Error GoTo 0

  BootstrapSuperadmin = "Bootstrap response: " & http.Status & vbCrLf & http.ResponseText
End Function

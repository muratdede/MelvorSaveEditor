$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PackageRoot = Split-Path -Parent $Root
$EditorPath = "melvor_save_editor.js"
$LogPath = Join-Path $Root "launcher.log"
$DataRoot = Join-Path $env:LOCALAPPDATA "MelvorSaveEditor"
$GeckoVersion = "0.37.1"

function Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')  $Message"
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
    Write-Host $Message
}

function Fail([string]$Message) {
    Log "ERROR: $Message"
    Write-Host ""
    Write-Host "Melvor Save Editor could not start." -ForegroundColor Red
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Diagnostic log:"
    Write-Host $LogPath
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

function Get-DefaultBrowserProgId {
    $paths = @(
        "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
        "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice"
    )
    foreach ($p in $paths) {
        try {
            $v = (Get-ItemProperty -Path $p -Name ProgId -ErrorAction Stop).ProgId
            if ($v) { return $v }
        } catch {}
    }
    return $null
}

function Detect-Browser {
    $progId = Get-DefaultBrowserProgId
    Log "Default browser ProgId: $progId"

    if ($progId -match "Firefox") { return "firefox" }
    if ($progId -match "MSEdge") { return "edge" }
    if ($progId -match "Brave") { return "brave" }
    if ($progId -match "Opera") { return "opera" }
    if ($progId -match "Chrome") { return "chrome" }

    # Fallback: choose first installed supported browser.
    $candidates = @("chrome","edge","brave","opera","firefox")
    foreach ($b in $candidates) {
        if (Find-BrowserExecutable $b) { return $b }
    }
    return $null
}

function Find-BrowserExecutable([string]$Browser) {
    $candidates = switch ($Browser) {
        "chrome" {
            @(
                "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
                "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
            )
        }
        "edge" {
            @(
                "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
                "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
                "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
            )
        }
        "brave" {
            @(
                "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
                "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
                "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
            )
        }
        "opera" {
            @(
                "$env:LOCALAPPDATA\Programs\Opera\opera.exe",
                "$env:LOCALAPPDATA\Programs\Opera GX\opera.exe",
                "$env:ProgramFiles\Opera\opera.exe",
                "${env:ProgramFiles(x86)}\Opera\opera.exe"
            )
        }
        "firefox" {
            @(
                "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
                "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe",
                "$env:LOCALAPPDATA\Mozilla Firefox\firefox.exe"
            )
        }
    }

    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

function Send-Cdp($Socket, [int]$Id, [string]$Method, $Params, [int]$TimeoutMs = 15000) {
    $obj = @{ id=$Id; method=$Method; params=$Params }
    $json = $obj | ConvertTo-Json -Compress -Depth 30
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $segment = New-Object System.ArraySegment[byte] -ArgumentList @(,$bytes)
    $cts = New-Object System.Threading.CancellationTokenSource
    $cts.CancelAfter($TimeoutMs)
    $token = $cts.Token
    try {
        $null = $Socket.SendAsync($segment,[System.Net.WebSockets.WebSocketMessageType]::Text,$true,$token).GetAwaiter().GetResult()
        while ($true) {
            $buffer = New-Object byte[] 262144
            $responseBytes = New-Object System.Collections.Generic.List[byte]
            do {
                $recv = New-Object System.ArraySegment[byte] -ArgumentList @(,$buffer)
                $result = $Socket.ReceiveAsync($recv,$token).GetAwaiter().GetResult()
                if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                    throw "Browser closed the DevTools WebSocket."
                }
                for ($i=0; $i -lt $result.Count; $i++) { $responseBytes.Add($buffer[$i]) }
            } while (-not $result.EndOfMessage)
            $text = [Text.Encoding]::UTF8.GetString($responseBytes.ToArray())
            $response = $text | ConvertFrom-Json
            if ($response.id -eq $Id) { return $response }
        }
    } finally {
        $cts.Dispose()
    }
}

function Start-ChromiumBackend([string]$Browser, [string]$Exe) {
    $profile = Join-Path $DataRoot ("Profiles\" + $Browser)
    New-Item -ItemType Directory -Force -Path $profile | Out-Null
    $portFile = Join-Path $profile "DevToolsActivePort"
    Remove-Item $portFile -Force -ErrorAction SilentlyContinue

    $args = @(
        "--remote-debugging-port=0",
        "--remote-allow-origins=http://localhost",
        "--user-data-dir=`"$profile`"",
        "--no-first-run",
        "--no-default-browser-check",
        "https://www.melvoridle.com/"
    )

    Log "Starting $Browser with CDP backend."
    Start-Process -FilePath $Exe -ArgumentList $args | Out-Null

    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path $portFile)) {
        if ((Get-Date) -gt $deadline) { Fail "$Browser did not create DevToolsActivePort." }
        Start-Sleep -Milliseconds 200
    }

    $port = [int](Get-Content $portFile)[0]
    Log "DevTools port: $port"

    $target = $null
    $deadline = (Get-Date).AddSeconds(60)
    while (-not $target) {
        try {
            $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 2
            $target = $targets | Where-Object {
                $_.type -eq "page" -and $_.url -like "https://*.melvoridle.com/*"
            } | Select-Object -First 1
        } catch {}
        if (-not $target) {
            if ((Get-Date) -gt $deadline) { Fail "Melvor tab was not found in $browser." }
            Start-Sleep -Milliseconds 300
        }
    }

    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $socket.Options.SetRequestHeader("Origin","http://localhost")
    $uri = New-Object System.Uri($target.webSocketDebuggerUrl)
    $token = [Threading.CancellationToken]::None

    try {
        $null = $socket.ConnectAsync($uri,$token).GetAwaiter().GetResult()
        Log "CDP WebSocket connected."

        $id = 1
        $deadline = (Get-Date).AddMinutes(3)
        while ($true) {
            $r = Send-Cdp $socket $id "Runtime.evaluate" @{
                expression="Boolean(document.body && typeof game !== 'undefined' && typeof SaveWriter !== 'undefined')";
                returnByValue=$true
            }
            $id++
            if ([bool]$r.result.result.value) { break }
            if ((Get-Date) -gt $deadline) { Fail "Melvor game globals were not ready after 3 minutes." }
            Start-Sleep -Milliseconds 500
        }

        Log "Melvor game globals are ready."
        $script = Get-Content -Raw -Encoding UTF8 $EditorPath
        $bytes = [Text.Encoding]::UTF8.GetBytes($script)
        $payload = [Convert]::ToBase64String($bytes)

        $bootstrap = @"
(() => {
 window.__melvorSaveEditorInjectionState={status:'scheduled',error:null};
 setTimeout(() => {
   try {
     window.__melvorSaveEditorInjectionState.status='running';
     const b=atob('$payload');
     const u=Uint8Array.from(b,c=>c.charCodeAt(0));
     const s=new TextDecoder('utf-8').decode(u);
     (0,eval)(s);
     window.__melvorSaveEditorInjectionState.status='executed';
   } catch(e) {
     window.__melvorSaveEditorInjectionState.status='error';
     window.__melvorSaveEditorInjectionState.error=e && (e.stack||e.message) ? (e.stack||e.message) : String(e);
   }
 },0);
 return true;
})()
"@

        $null = Send-Cdp $socket $id "Runtime.evaluate" @{expression=$bootstrap;returnByValue=$true;userGesture=$true}
        $id++
        $deadline = (Get-Date).AddSeconds(20)
        while ($true) {
            Start-Sleep -Milliseconds 300
            $v = Send-Cdp $socket $id "Runtime.evaluate" @{
                expression="JSON.stringify({state:window.__melvorSaveEditorInjectionState||null,exists:Boolean(document.getElementById('melvor-smart-save-editor'))})";
                returnByValue=$true
            }
            $id++
            $state = ($v.result.result.value | ConvertFrom-Json)
            if ($state.state.status -eq "error") { Fail ("Editor JS error: " + $state.state.error) }
            if ($state.exists) { break }
            if ((Get-Date) -gt $deadline) { Fail "Editor did not appear in the live DOM." }
        }
        Log "Editor injected successfully."
    }
    finally {
        if ($socket -and $socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            try { $null=$socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,"done",$token).GetAwaiter().GetResult() } catch {}
        }
        if ($socket) { $socket.Dispose() }
    }
}

function Ensure-GeckoDriver {
    $tools = Join-Path $DataRoot "Tools"
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
    $exe = Join-Path $tools "geckodriver.exe"
    if (Test-Path $exe) { return $exe }

    $zip = Join-Path $tools "geckodriver.zip"
    $url = "https://github.com/mozilla/geckodriver/releases/download/v$GeckoVersion/geckodriver-v$GeckoVersion-win64.zip"
    Log "Downloading geckodriver $GeckoVersion for Firefox..."
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tools -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $exe)) { Fail "geckodriver download/extraction failed." }
    return $exe
}

function Invoke-WebDriver([string]$Method,[string]$Uri,$Body=$null) {
    $params = @{ Method=$Method; Uri=$Uri; ContentType="application/json"; TimeoutSec=30 }
    if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Compress -Depth 30) }
    return Invoke-RestMethod @params
}

function Start-FirefoxBackend([string]$FirefoxExe) {
    $driver = Ensure-GeckoDriver
    $port = 4444
    $logFile = Join-Path $Root "geckodriver.log"

    Log "Starting Firefox through geckodriver."
    $proc = Start-Process -FilePath $driver -ArgumentList @("--port",$port) -PassThru -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $logFile

    try {
        $deadline=(Get-Date).AddSeconds(20)
        while ($true) {
            try {
                $null=Invoke-RestMethod -Uri "http://127.0.0.1:$port/status" -TimeoutSec 2
                break
            } catch {
                if ((Get-Date)-gt $deadline) { Fail "geckodriver did not start." }
                Start-Sleep -Milliseconds 250
            }
        }

        $profile = Join-Path $DataRoot "Profiles\firefox"
        New-Item -ItemType Directory -Force -Path $profile | Out-Null

        $sessionBody = @{
            capabilities = @{
                alwaysMatch = @{
                    browserName = "firefox"
                    "moz:firefoxOptions" = @{
                        binary = $FirefoxExe
                        args = @("-profile",$profile)
                    }
                }
            }
        }

        $session = Invoke-WebDriver "POST" "http://127.0.0.1:$port/session" $sessionBody
        $sessionId = $session.value.sessionId
        if (-not $sessionId) { Fail "Firefox WebDriver session could not be created." }

        $null = Invoke-WebDriver "POST" "http://127.0.0.1:$port/session/$sessionId/url" @{url="https://www.melvoridle.com/"}
        Log "Firefox opened Melvor."

        $deadline=(Get-Date).AddMinutes(3)
        while ($true) {
            try {
                $ready=Invoke-WebDriver "POST" "http://127.0.0.1:$port/session/$sessionId/execute/sync" @{
                    script="return Boolean(document.body && typeof game !== 'undefined' && typeof SaveWriter !== 'undefined');"
                    args=@()
                }
                if ([bool]$ready.value) { break }
            } catch {}
            if ((Get-Date)-gt $deadline) { Fail "Melvor game globals were not ready in Firefox after 3 minutes." }
            Start-Sleep -Milliseconds 500
        }

        Log "Melvor game globals are ready."
        $script=Get-Content -Raw -Encoding UTF8 $EditorPath
        $inject=Invoke-WebDriver "POST" "http://127.0.0.1:$port/session/$sessionId/execute/sync" @{
            script="const s=arguments[0]; setTimeout(()=>{try{(0,eval)(s)}catch(e){window.__melvorSaveEditorWebDriverError=e.stack||e.message||String(e)}},0); return true;"
            args=@($script)
        }

        $deadline=(Get-Date).AddSeconds(20)
        while ($true) {
            $check=Invoke-WebDriver "POST" "http://127.0.0.1:$port/session/$sessionId/execute/sync" @{
                script="return {exists:Boolean(document.getElementById('melvor-smart-save-editor')),error:window.__melvorSaveEditorWebDriverError||null};"
                args=@()
            }
            if ($check.value.error) { Fail ("Editor JS error: " + $check.value.error) }
            if ($check.value.exists) { break }
            if ((Get-Date)-gt $deadline) { Fail "Editor did not appear in Firefox." }
            Start-Sleep -Milliseconds 300
        }

        Log "Editor injected successfully in Firefox."
        # Keep the WebDriver session alive while Firefox is in use.
        Write-Host ""
        Write-Host "Melvor Save Editor is running in Firefox."
        Write-Host "Keep this window open while using the editor."
        Write-Host "Close Firefox when finished."
        while (-not $proc.HasExited) {
            Start-Sleep -Seconds 2
            try {
                $null=Invoke-RestMethod -Uri "http://127.0.0.1:$port/session/$sessionId/url" -TimeoutSec 2
            } catch { break }
        }
    }
    finally {
        try {
            if ($sessionId) { $null=Invoke-WebDriver "DELETE" "http://127.0.0.1:$port/session/$sessionId" }
        } catch {}
        try { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force } } catch {}
    }
}

Remove-Item $LogPath -Force -ErrorAction SilentlyContinue
Log "Launcher started."

if (-not (Test-Path $EditorPath)) { Fail "melvor_save_editor.js was not found." }

$browser=Detect-Browser
if (-not $browser) { Fail "No supported browser was found." }

$exe=Find-BrowserExecutable $browser
if (-not $exe) { Fail "Default browser '$browser' was detected, but its executable was not found." }

Log "Selected browser: $browser"
Log "Executable: $exe"

if ($browser -eq "firefox") {
    Start-FirefoxBackend $exe
} else {
    Start-ChromiumBackend $browser $exe
}

Log "Done."

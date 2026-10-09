Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendUrl = 'http://localhost:3001'
$frontendUrl = 'http://localhost:5173'
$stateDirectory = Join-Path $projectRoot '.launcher'
$backendLog = Join-Path $stateDirectory 'backend.log'
$backendErrorLog = Join-Path $stateDirectory 'backend-error.log'
$frontendLog = Join-Path $stateDirectory 'frontend.log'
$frontendErrorLog = Join-Path $stateDirectory 'frontend-error.log'

# 确定 node 路径（优先 managed node）
$managedNode = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions\22.22.2\node.exe'
if (Test-Path $managedNode) {
    $nodeExe = $managedNode
} else {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        $nodeExe = $nodeCommand.Source
    } else {
        $nodeExe = 'node'
    }
}

if (-not (Test-Path -LiteralPath $stateDirectory)) {
    New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
}

function Test-Port {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn -and $conn.Count -ge 1)
    }
    catch { return $false }
}

function Test-Backend { return Test-Port -Port 3001 }
function Test-Frontend { return Test-Port -Port 5173 }

# ========== GUI ==========

$form = New-Object System.Windows.Forms.Form
$form.Text = '木雅语助手 · 本地启动器'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(520, 600)
$form.MinimumSize = New-Object System.Drawing.Size(536, 639)
$form.BackColor = [System.Drawing.Color]::FromArgb(247, 243, 235)
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)

# 头部
$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Dock = 'Top'
$headerPanel.Height = 112
$headerPanel.BackColor = [System.Drawing.Color]::FromArgb(126, 40, 43)
$form.Controls.Add($headerPanel)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = '木雅语助手控制台'
$titleLabel.ForeColor = [System.Drawing.Color]::White
$titleLabel.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 20, [System.Drawing.FontStyle]::Bold)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(28, 22)
$headerPanel.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = '一键启动前后端服务并打开对应页面'
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(243, 214, 178)
$subtitleLabel.AutoSize = $true
$subtitleLabel.Location = New-Object System.Drawing.Point(31, 70)
$headerPanel.Controls.Add($subtitleLabel)

# 后端状态
$backendStatusPanel = New-Object System.Windows.Forms.Panel
$backendStatusPanel.Location = New-Object System.Drawing.Point(24, 132)
$backendStatusPanel.Size = New-Object System.Drawing.Size(472, 28)
$backendStatusPanel.BackColor = [System.Drawing.Color]::White
$backendStatusPanel.BorderStyle = 'FixedSingle'
$form.Controls.Add($backendStatusPanel)

$backendDot = New-Object System.Windows.Forms.Label
$backendDot.Text = [char]0x25CF
$backendDot.Font = New-Object System.Drawing.Font('Segoe UI Symbol', 11)
$backendDot.AutoSize = $true
$backendDot.Location = New-Object System.Drawing.Point(12, 5)
$backendStatusPanel.Controls.Add($backendDot)

$backendLabel = New-Object System.Windows.Forms.Label
$backendLabel.Text = '后端 (3001)：检测中...'
$backendLabel.AutoSize = $true
$backendLabel.Location = New-Object System.Drawing.Point(36, 7)
$backendStatusPanel.Controls.Add($backendLabel)

# 前端状态
$frontendStatusPanel = New-Object System.Windows.Forms.Panel
$frontendStatusPanel.Location = New-Object System.Drawing.Point(24, 166)
$frontendStatusPanel.Size = New-Object System.Drawing.Size(472, 28)
$frontendStatusPanel.BackColor = [System.Drawing.Color]::White
$frontendStatusPanel.BorderStyle = 'FixedSingle'
$form.Controls.Add($frontendStatusPanel)

$frontendDot = New-Object System.Windows.Forms.Label
$frontendDot.Text = [char]0x25CF
$frontendDot.Font = New-Object System.Drawing.Font('Segoe UI Symbol', 11)
$frontendDot.AutoSize = $true
$frontendDot.Location = New-Object System.Drawing.Point(12, 5)
$frontendStatusPanel.Controls.Add($frontendDot)

$frontendLabel = New-Object System.Windows.Forms.Label
$frontendLabel.Text = '前端 (5173)：检测中...'
$frontendLabel.AutoSize = $true
$frontendLabel.Location = New-Object System.Drawing.Point(36, 7)
$frontendStatusPanel.Controls.Add($frontendLabel)

# 按钮创建函数
function New-LauncherButton([string] $text, [int] $top, [System.Drawing.Color] $color) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $text
    $button.Location = New-Object System.Drawing.Point(24, $top)
    $button.Size = New-Object System.Drawing.Size(472, 52)
    $button.FlatStyle = 'Flat'
    $button.FlatAppearance.BorderSize = 0
    $button.BackColor = $color
    $button.ForeColor = [System.Drawing.Color]::White
    $button.Cursor = [System.Windows.Forms.Cursors]::Hand
    $button.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11, [System.Drawing.FontStyle]::Bold)
    $form.Controls.Add($button)
    return $button
}

$startButton = New-LauncherButton '启动服务（前后端）' 210 ([System.Drawing.Color]::FromArgb(33, 113, 91))
$stopButton = New-LauncherButton '停止服务（释放端口）' 274 ([System.Drawing.Color]::FromArgb(151, 48, 48))
$open2DButton = New-LauncherButton '打开 2D 用户界面' 338 ([System.Drawing.Color]::FromArgb(164, 76, 51))
$open3DButton = New-LauncherButton '打开 3D 智慧空间' 402 ([System.Drawing.Color]::FromArgb(55, 91, 128))
$openConfigButton = New-LauncherButton '打开 3D 配置页面' 466 ([System.Drawing.Color]::FromArgb(102, 66, 128))

$footerLabel = New-Object System.Windows.Forms.Label
$footerLabel.Text = '2D /  ·  3D /wisdom-space  ·  配置 /wisdom-space/config'
$footerLabel.ForeColor = [System.Drawing.Color]::FromArgb(105, 96, 82)
$footerLabel.AutoSize = $true
$footerLabel.Location = New-Object System.Drawing.Point(25, 540)
$form.Controls.Add($footerLabel)

# ========== 状态更新 ==========
function Update-Status {
    $bRunning = Test-Backend
    $fRunning = Test-Frontend

    if ($bRunning) {
        $backendDot.ForeColor = [System.Drawing.Color]::FromArgb(34, 160, 107)
        $backendLabel.Text = '后端 (3001)：运行中'
    } else {
        $backendDot.ForeColor = [System.Drawing.Color]::FromArgb(191, 62, 62)
        $backendLabel.Text = '后端 (3001)：未启动'
    }

    if ($fRunning) {
        $frontendDot.ForeColor = [System.Drawing.Color]::FromArgb(34, 160, 107)
        $frontendLabel.Text = '前端 (5173)：运行中'
    } else {
        $frontendDot.ForeColor = [System.Drawing.Color]::FromArgb(191, 62, 62)
        $frontendLabel.Text = '前端 (5173)：未启动'
    }

    $allRunning = $bRunning -and $fRunning
    $anyRunning = $bRunning -or $fRunning

    $startButton.Enabled = -not $allRunning
    $stopButton.Enabled = $anyRunning

    if ($allRunning) {
        $startButton.Text = '服务已启动'
    } else {
        $startButton.Text = '启动服务（前后端）'
    }
    return $allRunning
}

# ========== 启动服务 ==========
function Start-Services {
    $bRunning = Test-Backend
    $fRunning = Test-Frontend

    if ($bRunning -and $fRunning) {
        Update-Status | Out-Null
        return $true
    }

    $startButton.Enabled = $false
    $startButton.Text = '正在启动服务，请稍候...'
    $form.Refresh()

    # 启动后端
    if (-not $bRunning) {
        $backendDot.ForeColor = [System.Drawing.Color]::FromArgb(218, 151, 45)
        $backendLabel.Text = '后端 (3001)：正在启动...'
        $form.Refresh()

        # 删除旧日志避免锁定
        Remove-Item $backendLog -ErrorAction SilentlyContinue
        Remove-Item $backendErrorLog -ErrorAction SilentlyContinue

        try {
            Start-Process -FilePath $nodeExe `
                -ArgumentList @('node_modules\tsx\dist\cli.mjs', 'watch', 'server\index.ts') `
                -WorkingDirectory $projectRoot `
                -RedirectStandardOutput $backendLog `
                -RedirectStandardError $backendErrorLog `
                -WindowStyle Hidden | Out-Null
        }
        catch {
            [System.Windows.Forms.MessageBox]::Show(
                '后端启动失败：' + [Environment]::NewLine + $_.Exception.Message,
                '启动失败', 'OK', 'Error') | Out-Null
            Update-Status | Out-Null
            return $false
        }

        for ($i = 0; $i -lt 40; $i++) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 350
            if (Test-Backend) { break }
        }
    }

    # 启动前端
    if (-not $fRunning) {
        $frontendDot.ForeColor = [System.Drawing.Color]::FromArgb(218, 151, 45)
        $frontendLabel.Text = '前端 (5173)：正在启动...'
        $form.Refresh()

        Remove-Item $frontendLog -ErrorAction SilentlyContinue
        Remove-Item $frontendErrorLog -ErrorAction SilentlyContinue

        try {
            Start-Process -FilePath $nodeExe `
                -ArgumentList @('node_modules\vite\bin\vite.js', '--host', '0.0.0.0', '--port', '5173') `
                -WorkingDirectory $projectRoot `
                -RedirectStandardOutput $frontendLog `
                -RedirectStandardError $frontendErrorLog `
                -WindowStyle Hidden | Out-Null
        }
        catch {
            [System.Windows.Forms.MessageBox]::Show(
                '前端启动失败：' + [Environment]::NewLine + $_.Exception.Message,
                '启动失败', 'OK', 'Error') | Out-Null
            Update-Status | Out-Null
            return $false
        }

        for ($i = 0; $i -lt 40; $i++) {
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 350
            if (Test-Frontend) { break }
        }
    }

    $result = Update-Status
    if (-not (Test-Backend)) {
        [System.Windows.Forms.MessageBox]::Show(
            '后端未在预期时间内启动。请查看日志：' + [Environment]::NewLine + $backendErrorLog,
            '启动超时', 'OK', 'Warning') | Out-Null
    }
    if (-not (Test-Frontend)) {
        [System.Windows.Forms.MessageBox]::Show(
            '前端未在预期时间内启动。请查看日志：' + [Environment]::NewLine + $frontendErrorLog,
            '启动超时', 'OK', 'Warning') | Out-Null
    }
    return $result
}

# ========== 停止服务 ==========
function Stop-Services {
    # 1) 先按命令行匹配杀掉 tsx watch / vite / concurrently 父进程，
    #    避免 watcher 检测到子进程退出后自动重启（这是端口永远停不掉的根因）
    try {
        $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    } catch { $procs = @() }
    foreach ($proc in $procs) {
        $cmd = $proc.CommandLine
        if (-not $cmd) { continue }
        $isOurs = $false
        if ($cmd -match 'tsx' -and $cmd -match 'watch' -and $cmd -match 'server') { $isOurs = $true }
        if ($cmd -match 'vite' -and $cmd -match '5173') { $isOurs = $true }
        if ($cmd -match 'concurrently') { $isOurs = $true }
        if ($isOurs -and $proc.ProcessId -ne $PID) {
            try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch { }
        }
    }
    Start-Sleep -Milliseconds 800

    # 2) 再按端口兜底，杀掉仍占用端口的进程
    foreach ($port in @(3001, 5173)) {
        try {
            $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
                Select-Object -ExpandProperty OwningProcess -Unique
        }
        catch { continue }

        foreach ($procId in $pids) {
            if ($procId -le 4 -or $procId -eq $PID) { continue }
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if (-not $proc) { continue }
            if ($proc.ProcessName -notin @('node', 'nodejs')) {
                [System.Windows.Forms.MessageBox]::Show(
                    "端口 $port 由非 Node 进程占用（$($proc.ProcessName)），为避免误关闭，未结束该进程。",
                    '未关闭端口', 'OK', 'Warning') | Out-Null
                continue
            }
            Stop-Process -Id $procId -Force -ErrorAction Stop
        }
    }

    for ($i = 0; $i -lt 20; $i++) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 150
        if (-not (Test-Backend) -and -not (Test-Frontend)) { break }
    }

    Update-Status | Out-Null
}

# ========== 打开页面 ==========
function Open-Page([string] $path) {
    if (-not (Test-Frontend)) {
        if (-not (Start-Services)) { return }
    }
    try {
        Start-Process ($frontendUrl + $path)
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            '无法打开浏览器：' + $_.Exception.Message,
            '打开失败', 'OK', 'Error') | Out-Null
    }
}

# ========== 事件绑定 ==========
$startButton.Add_Click({ Start-Services | Out-Null })
$stopButton.Add_Click({ Stop-Services })
$open2DButton.Add_Click({ Open-Page '/' })
$open3DButton.Add_Click({ Open-Page '/wisdom-space' })
$openConfigButton.Add_Click({ Open-Page '/wisdom-space/config' })

# 定时检测
$statusTimer = New-Object System.Windows.Forms.Timer
$statusTimer.Interval = 2500
$statusTimer.Add_Tick({ Update-Status | Out-Null })
$statusTimer.Start()

$form.Add_Shown({ Update-Status | Out-Null })
$form.Add_FormClosed({ $statusTimer.Stop(); $statusTimer.Dispose() })

[void] $form.ShowDialog()

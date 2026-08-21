# 앱 아이콘 생성 (홈 화면 설치용)
#
# 왜 스크립트인가
#   PNG를 저장소에 그냥 넣어두면 나중에 색이나 모양을 바꿀 때 무엇으로
#   만들었는지 알 수 없습니다. 소스를 남겨둡니다.
#
# 무엇을 그리는가
#   이 프로젝트의 디자인 방향은 "계측기"입니다. 그래서 마크도 계기입니다 —
#   시간이 도는 링과 중심점.
#   드리퍼 모양은 쓰지 않습니다. 드리퍼는 대부분 원뿔 아니면 평바닥이라
#   작은 크기에서 서로 구분되지 않고, 실제로 한 번 시도했다가 접었습니다.
#
# 실행: powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root 'assets'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

# 어두운 바탕에 teal. 홈 화면이 밝든 어둡든 마크가 살아남습니다.
$bg   = [System.Drawing.Color]::FromArgb(255, 12, 13, 13)     # --paper (dark)
$mark = [System.Drawing.Color]::FromArgb(255, 45, 212, 191)   # --accent (dark)

function New-Icon {
  param([int]$Size, [string]$Path, [double]$Inset = 0.62, [bool]$Rounded = $true)

  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g   = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'

  # -- 바탕 --
  $brush = New-Object System.Drawing.SolidBrush($bg)
  if ($Rounded) {
    # iOS는 자체적으로 모서리를 깎지만, 안드로이드 일부 런처는 그대로 씁니다
    # AddArc는 int/float 오버로드가 둘 다 있어 PowerShell이 헷갈립니다.
    # 전부 [float]로 못박아야 합니다.
    $r = [float]($Size * 0.22); $d2 = [float]($r * 2); $s = [float]$Size
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc([float]0,    [float]0,    $d2, $d2, [float]180, [float]90)
    $p.AddArc($s-$d2,      [float]0,    $d2, $d2, [float]270, [float]90)
    $p.AddArc($s-$d2,      $s-$d2,      $d2, $d2, [float]0,   [float]90)
    $p.AddArc([float]0,    $s-$d2,      $d2, $d2, [float]90,  [float]90)
    $p.CloseFigure()
    $g.FillPath($brush, $p)
    $p.Dispose()
  } else {
    # maskable -- 런처가 임의로 잘라내므로 바탕을 꽉 채웁니다
    $g.FillRectangle($brush, 0, 0, $Size, $Size)
  }

  # -- 마크: 열린 링 + 중심점 --
  $d      = $Size * $Inset
  $off    = ($Size - $d) / 2
  $stroke = [Math]::Max(2, $Size * 0.075)

  $pen = New-Object System.Drawing.Pen($mark, $stroke)
  $pen.StartCap = 'Round'
  $pen.EndCap   = 'Round'
  # 12시에서 시작해 270도. 남은 90도의 빈틈이 "아직 남은 시간"입니다.
  $g.DrawArc($pen, [float]$off, [float]$off, [float]$d, [float]$d, -90, 270)

  $dot = $Size * 0.13
  $mb  = New-Object System.Drawing.SolidBrush($mark)
  $g.FillEllipse($mb, [float](($Size-$dot)/2), [float](($Size-$dot)/2), [float]$dot, [float]$dot)

  $pen.Dispose(); $mb.Dispose(); $brush.Dispose(); $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "  {0,-28} {1}x{1}" -f (Split-Path $Path -Leaf), $Size
}

New-Icon -Size 192 -Path (Join-Path $out 'icon-192.png')
New-Icon -Size 512 -Path (Join-Path $out 'icon-512.png')
# maskable -- 런처가 원형/스퀘어클로 잘라냅니다. 안전 영역(중앙 80%) 안에 마크를 둡니다.
New-Icon -Size 512 -Path (Join-Path $out 'icon-maskable-512.png') -Inset 0.44 -Rounded $false
# iOS 홈 화면 -- 투명도와 둥근 모서리를 iOS가 알아서 처리하므로 사각형으로 줍니다
New-Icon -Size 180 -Path (Join-Path $out 'apple-touch-icon.png') -Rounded $false

# OG 이미지 -- 카톡/슬랙 링크 미리보기. 정사각형이지만 없는 것보다 낫습니다.
New-Icon -Size 512 -Path (Join-Path $out 'og-image.png') -Rounded $false


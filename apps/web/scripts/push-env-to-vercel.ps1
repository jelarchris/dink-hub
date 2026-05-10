# Pushes apps/web/.env.local to Vercel production + preview, with overrides
# and rename-on-push for known typos. Uses --value so secrets never appear
# in terminal scrollback. Server-only vars are marked --sensitive.

$ErrorActionPreference = 'Continue'
$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
if (-not (Test-Path $envPath)) { Write-Error "Missing $envPath"; exit 1 }

$skip   = @('E2E_TEST_TOKEN')
$rename = @{
  'ESEND_FROM_EMAIL'   = 'RESEND_FROM_EMAIL'
  'TURNSTILE_SITE_KEY' = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'
}
$override = @{
  'NEXT_PUBLIC_APP_URL' = 'https://dinkhub-one.vercel.app'
  'NEXT_PUBLIC_APP_ENV' = 'production'
}

$lines = Get-Content $envPath | Where-Object { $_ -match '^[A-Z]' -and $_ -notmatch '^#' }
foreach ($line in $lines) {
  $parts = $line -split '=', 2
  if ($parts.Count -ne 2) { continue }
  $key = $parts[0].Trim()
  $val = $parts[1].Trim().Trim('"').Trim("'")
  if ($skip -contains $key) { Write-Host "skip      $key"; continue }
  if ($rename.ContainsKey($key)) { $key = $rename[$key] }
  if ($override.ContainsKey($key)) { $val = $override[$key] }
  if ([string]::IsNullOrWhiteSpace($val)) { Write-Host "blank     $key"; continue }

  $sensitive = -not $key.StartsWith('NEXT_PUBLIC_')
  $vargs = @('env','add',$key,'production','--value',$val,'--force','--yes')
  if ($sensitive) { $vargs += '--sensitive' }
  $tag = if ($sensitive) { ' (sensitive)' } else { '' }
  Write-Host "push      $key$tag"
  & vercel @vargs *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host "  ! exit $LASTEXITCODE" }
}
Write-Host "done."

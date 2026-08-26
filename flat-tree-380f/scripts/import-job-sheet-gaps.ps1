param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$devVarsPath = Join-Path $projectRoot '.dev.vars'
$wranglerPath = Join-Path $projectRoot 'node_modules\.bin\wrangler.cmd'
$workerUrl = 'https://flat-tree-380f.leightonsolo.workers.dev'

function Normalize-Name([string]$Value) {
  if ($null -eq $Value) { return '' }
  return (($Value -replace '\s+', ' ').Trim().ToLowerInvariant())
}

function Iso-Date([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return ([datetime]::Parse(
    $Value,
    [Globalization.CultureInfo]::GetCultureInfo('en-US')
  )).ToString('yyyy-MM-dd')
}

function Sql-Value($Value) {
  if ($null -eq $Value) { return 'NULL' }
  return "'" + ([string]$Value).Replace("'", "''") + "'"
}

function Inclusive-Weekdays([string]$Start, [string]$End) {
  $cursor = [datetime]::ParseExact($Start, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  $finish = [datetime]::ParseExact($End, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  if ($finish -lt $cursor) { throw "End date $End is before start date $Start" }
  $days = 0
  while ($cursor -le $finish) {
    if ($cursor.DayOfWeek -notin @([DayOfWeek]::Saturday, [DayOfWeek]::Sunday)) { $days++ }
    $cursor = $cursor.AddDays(1)
  }
  return [Math]::Max(1, $days)
}

$vars = @{}
Get-Content -LiteralPath $devVarsPath | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)$') {
    $vars[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
if (-not $vars['API_KEY']) { throw 'API_KEY is missing from .dev.vars' }

$headers = @{ 'X-Api-Key' = $vars['API_KEY'] }
$jobs = Invoke-RestMethod -Uri "$workerUrl/jobinfo/all" -Headers $headers
$events = Invoke-RestMethod -Uri "$workerUrl/calendar/events" -Headers $headers
$sheet = Import-Csv -LiteralPath $InputPath -Delimiter "`t"

$jobAliases = @{
  (Normalize-Name 'Quest Dallas, Austin, & San Antonio') = Normalize-Name 'Quest Dallas, Austin & San Antonio'
}
$eventAliases = @{
  (Normalize-Name 'Quest Dallas, Austin, & San Antonio') = Normalize-Name 'Quest Dallas'
}

$jobMap = @{}
foreach ($job in $jobs) { $jobMap[(Normalize-Name ([string]$job.job_name))] = $job }
$eventMap = @{}
foreach ($event in $events) {
  $key = Normalize-Name ([string]$event.title)
  if (-not $eventMap.ContainsKey($key)) { $eventMap[$key] = @() }
  $eventMap[$key] += $event
}

$scheduleUpdates = @()
$estimateUpdates = @()
$ticketUpdates = @()
$eventInserts = @()
$preservedDateConflicts = @()
$alreadyMatchingTickets = @()
$missingJobs = @()
$ticketConflicts = @()
$ambiguousTickets = @()

foreach ($row in $sheet) {
  $sourceName = ([string]$row.'Job Name').Trim()
  if (-not $sourceName) { continue }

  $sourceKey = Normalize-Name $sourceName
  $jobKey = if ($jobAliases.ContainsKey($sourceKey)) { $jobAliases[$sourceKey] } else { $sourceKey }
  $eventKey = if ($eventAliases.ContainsKey($sourceKey)) { $eventAliases[$sourceKey] } else { $sourceKey }
  $job = $jobMap[$jobKey]
  if (-not $job) {
    $missingJobs += $sourceName
    continue
  }

  $ticket = ([string]$row.Ticket).Trim()
  $sheetStart = Iso-Date ([string]$row.'Scheduled Start')
  $sheetEnd = Iso-Date ([string]$row.'Scheduled End')
  $lastCalibrated = Iso-Date ([string]$row.'Last Calibrated')
  if ([bool]$sheetStart -ne [bool]$sheetEnd) { throw "$sourceName has only one scheduled date" }

  $currentStart = ([string]$job.scheduled_start_date).Trim()
  $currentEnd = ([string]$job.scheduled_end_date).Trim()
  $effectiveStart = $currentStart
  $effectiveEnd = $currentEnd

  if ($sheetStart) {
    if (-not $currentStart -and -not $currentEnd) {
      $scheduleUpdates += [pscustomobject]@{ id = $job.id; name = $job.job_name; start = $sheetStart; end = $sheetEnd }
      $effectiveStart = $sheetStart
      $effectiveEnd = $sheetEnd
    } elseif ($currentStart -ne $sheetStart -or $currentEnd -ne $sheetEnd) {
      $preservedDateConflicts += [pscustomobject]@{
        name = $job.job_name
        sheet_start = $sheetStart
        sheet_end = $sheetEnd
        kept_start = $currentStart
        kept_end = $currentEnd
      }
    }
  }

  if ($effectiveStart -and $effectiveEnd) {
    $calculatedDays = Inclusive-Weekdays $effectiveStart $effectiveEnd
    if ([int]$job.estimated_days -ne $calculatedDays) {
      $estimateUpdates += [pscustomobject]@{
        id = $job.id
        name = $job.job_name
        start = $effectiveStart
        end = $effectiveEnd
        days = $calculatedDays
      }
    }
  }

  if (-not $ticket) { continue }
  $candidates = @($eventMap[$eventKey])
  $chosen = $null

  if ($sheetStart) {
    $exact = @($candidates | Where-Object { $_.start_date -eq $sheetStart -and $_.end_date -eq $sheetEnd })
    if ($exact.Count -gt 1) {
      $ambiguousTickets += "$sourceName has multiple exact-date calendar events"
      continue
    }
    if ($exact.Count -eq 1) { $chosen = $exact[0] }

    if (-not $chosen) {
      $sameYear = @($candidates | Where-Object {
        ([datetime]$_.start_date).Year -eq ([datetime]$sheetStart).Year
      } | Sort-Object @{ Expression = { [Math]::Abs((([datetime]$_.start_date) - ([datetime]$sheetStart)).Days) } })
      if ($sameYear.Count -gt 0) { $chosen = $sameYear[0] }
    }
  } elseif ($lastCalibrated) {
    $completionMatches = @($candidates | Where-Object { $_.end_date -eq $lastCalibrated })
    if ($completionMatches.Count -gt 1) {
      $ambiguousTickets += "$sourceName has multiple calendar events ending $lastCalibrated"
      continue
    }
    if ($completionMatches.Count -eq 1) { $chosen = $completionMatches[0] }
  }

  if ($chosen) {
    $existingTicket = ([string]$chosen.ticket_id).Trim()
    if ($existingTicket -and $existingTicket -ne $ticket) {
      $ticketConflicts += [pscustomobject]@{ name = $sourceName; event_id = $chosen.id; existing = $existingTicket; sheet = $ticket }
    } elseif ($existingTicket -eq $ticket) {
      $alreadyMatchingTickets += [pscustomobject]@{ name = $sourceName; event_id = $chosen.id; ticket = $ticket }
    } else {
      $ticketUpdates += [pscustomobject]@{ name = $sourceName; event_id = $chosen.id; ticket = $ticket }
    }
  } elseif ($sheetStart) {
    $eventInserts += [pscustomobject]@{
      title = $sourceName
      customer = $job.customer
      start = $sheetStart
      end = $sheetEnd
      ticket = $ticket
    }
  } else {
    $ambiguousTickets += "$sourceName has a ticket but no uniquely resolvable calendar event"
  }
}

if ($missingJobs.Count -or $ticketConflicts.Count -or $ambiguousTickets.Count) {
  [pscustomobject]@{
    missing_jobs = $missingJobs
    ticket_conflicts = $ticketConflicts
    ambiguous_tickets = $ambiguousTickets
  } | ConvertTo-Json -Depth 8
  throw 'Import validation failed; no changes were applied'
}

$plan = [pscustomobject]@{
  sheet_rows = @($sheet | Where-Object { ([string]$_.'Job Name').Trim() }).Count
  schedule_updates = $scheduleUpdates.Count
  estimate_updates = $estimateUpdates.Count
  ticket_updates = $ticketUpdates.Count
  already_matching_tickets = $alreadyMatchingTickets.Count
  event_inserts = $eventInserts.Count
  preserved_date_conflicts = $preservedDateConflicts.Count
  events_to_insert = @($eventInserts | Select-Object title,start,end,ticket)
  date_conflicts_preserved = $preservedDateConflicts
}
$plan | ConvertTo-Json -Depth 8

if (-not $Apply) { return }

$sql = [Collections.Generic.List[string]]::new()
$sql.Add('-- Generated by scripts/import-job-sheet-gaps.ps1')

foreach ($update in $scheduleUpdates) {
  $sql.Add(@"
UPDATE job_info
SET scheduled_start_date = $(Sql-Value $update.start),
    scheduled_end_date = $(Sql-Value $update.end),
    updated_at = datetime('now')
WHERE id = $($update.id)
  AND (scheduled_start_date IS NULL OR trim(scheduled_start_date) = '')
  AND (scheduled_end_date IS NULL OR trim(scheduled_end_date) = '');
"@)
}

foreach ($update in $estimateUpdates) {
  $sql.Add(@"
UPDATE job_info
SET estimated_days = $($update.days),
    updated_at = datetime('now')
WHERE id = $($update.id)
  AND scheduled_start_date = $(Sql-Value $update.start)
  AND scheduled_end_date = $(Sql-Value $update.end);
"@)
}

foreach ($update in $ticketUpdates) {
  $sql.Add(@"
UPDATE calendar_events
SET ticket_id = $(Sql-Value $update.ticket),
    updated_at = datetime('now')
WHERE id = $($update.event_id)
  AND (ticket_id IS NULL OR trim(ticket_id) = '');
"@)
}

foreach ($insert in $eventInserts) {
  $sql.Add(@"
INSERT INTO calendar_events (
  title, event_type, status, customer, start_date, end_date, ticket_id, notes
)
SELECT
  $(Sql-Value $insert.title), 'calibration', 'booked', $(Sql-Value $insert.customer),
  $(Sql-Value $insert.start), $(Sql-Value $insert.end), $(Sql-Value $insert.ticket),
  'Imported from Job Info sheet gap fill'
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_events
  WHERE lower(trim(title)) = lower(trim($(Sql-Value $insert.title)))
    AND start_date = $(Sql-Value $insert.start)
    AND end_date = $(Sql-Value $insert.end)
);
"@)
}

$tempSql = Join-Path ([IO.Path]::GetTempPath()) ("job-info-gap-import-" + [guid]::NewGuid().ToString('N') + '.sql')
try {
  [IO.File]::WriteAllLines($tempSql, $sql)
  & $wranglerPath d1 execute calibration-db --remote --file $tempSql
  if ($LASTEXITCODE -ne 0) { throw "Wrangler exited with code $LASTEXITCODE" }
} finally {
  if (Test-Path -LiteralPath $tempSql) { Remove-Item -LiteralPath $tempSql -Force }
}

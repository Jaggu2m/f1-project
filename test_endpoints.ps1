$endpoints = @(
    "http://127.0.0.1:8000/",
    "http://127.0.0.1:8000/race/2023/10",
    "http://127.0.0.1:8000/race/2023/10/track",
    "http://127.0.0.1:8000/race/2023/10/drivers",
    "http://127.0.0.1:8000/race/2023/10/positions?t=100",
    "http://127.0.0.1:8000/race/2023/10/telemetry?driver=VER&start=50&end=100"
)

foreach ($endpoint in $endpoints) {
    try {
        $response = Invoke-RestMethod -Uri $endpoint -Method Get -ErrorAction Stop
        Write-Host "SUCCESS: $endpoint"
        # Print a small snippet of the response
        $json = $response | ConvertTo-Json -Depth 2 -Compress
        if ($json.Length -gt 150) {
            $json = $json.Substring(0, 150) + "..."
        }
        Write-Host "  -> $json"
    } catch {
        Write-Host "FAILED:  $endpoint"
        Write-Host "  -> $( $_.Exception.Message )"
    }
}

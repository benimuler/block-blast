# Run as Administrator to allow phone connections
New-NetFirewallRule -DisplayName "Block Blast Game" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private,Domain
Write-Host "Firewall rule added for port 3001"
Write-Host "Phone URL: http://$(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress):3001"

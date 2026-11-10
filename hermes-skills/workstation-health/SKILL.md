---
name: workstation-health
description: "Collect and report Windows workstation health metrics (CPU, memory, disk, battery, processes). Use when user requests system monitoring or performance diagnostics."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    house: 6
    domains: ["disk cleanup", "workstation health", "system health", "disk space"]
    tags: [system, monitoring, windows, performance, diagnostics]
    related_skills: []
---

# Workstation Health Check

## Overview

Collect and report system health metrics for Windows workstations using WMI (Windows Management Instrumentation). Useful for performance diagnostics, resource monitoring, and identifying system bottlenecks.

## When to Use

- User requests system health monitoring
- Need to report CPU, RAM, disk, or battery status
- Investigating performance issues
- Checking resource consumption trends

## Procedure

### 1. Gather System Metrics

**CPU Usage:**
```powershell
wmic cpu get loadpercentage
```

**Memory Usage:**
```powershell
wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /Value
```

**Disk Usage (C:):**
```powershell
wmic logicaldisk where "DeviceID='C:'" get Size,FreeSpace /Value
```

**Battery Status:**
```powershell
wmic path win32_battery get EstimatedChargeRemaining,BatteryStatus /Value
```

**Top Processes (filtered >10MB):**
```powershell
wmic process where "WorkingSetSize>10000000" get Name,WorkingSetSize /format:list
```

### 2. Report Format

Structure the report as:
- CPU Usage (percentage)
- Memory Usage (total, used, percentage)
- Disk Usage (total, used, percentage, free space)
- Battery Status (charge %, charging/discharging)
- Top 10 processes by memory consumption
- Unusual findings section with highlights

### 3. Highlight Issues

Flag as unusual:
- CPU > 80%
- Memory > 85%
- Disk > 90%
- Battery < 20% and discharging
- No large memory consumers (may indicate filtering too aggressive)

## Common Pitfalls

1. **Using `tasklist /fo csv` can be slow.** Use `wmic process where "WorkingSetSize>10000000"` to filter at the source for better performance.

2. **Battery queries fail on desktops.** Always handle the case where `win32_battery` returns no results.

3. **Memory values are in KB.** Convert to MB or GB for human-readable output.

## Verification Checklist

- [ ] CPU load between 0-100%
- [ ] Memory percentage between 0-100%
- [ ] Disk usage between 0-100%
- [ ] Battery percentage between 0-100% (if present)
- [ ] Process list returns valid results
- [ ] Report formatted clearly with sections

## Example Output

```
=======================================================
      WORKSTATION HEALTH REPORT
=======================================================

--- CPU Usage ---
Load: 19%

--- Memory Usage ---
Total: 15.7 GB
Used:  14.4 GB (91.9%)

--- Disk Usage (C:) ---
Total: 161.0 GB
Used:  158.7 GB (98.6%)

--- Battery Status ---
Charge: 100%
Status: Discharging

--- Top 10 Processes by Memory ---
chrome.exe  88.9 MB
python.exe  84.5 MB
Code.exe    83.0 MB

UNUSUAL FINDINGS:
  - High memory usage: 91.9%
  - Disk nearly full: 98.6% used (2.32 GB free)
```
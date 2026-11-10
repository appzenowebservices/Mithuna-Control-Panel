# Windows WMI Reference

## CPU Metrics
- `LoadPercentage` - Processor load as integer 0-100

## Memory Metrics
- `TotalVisibleMemorySize` - Total physical memory in KB
- `FreePhysicalMemory` - Available physical memory in KB

## Disk Metrics
- `Size` - Total disk capacity in bytes
- `FreeSpace` - Available free space in bytes

## Battery Metrics
- `EstimatedChargeRemaining` - Battery level as percentage 0-100
- `BatteryStatus` - 1=Charging, 2=Discharging, 3=Critical

## Process Metrics
- `Name` - Process name
- `WorkingSetSize` - Process memory usage in bytes
- `ProcessId` - Unique process identifier
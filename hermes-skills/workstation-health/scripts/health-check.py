import subprocess
import re
import sys

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
    return result.stdout.strip()

def get_cpu_load():
    cpu_out = run_cmd('wmic cpu get loadpercentage 2>nul')
    cpu_lines = [l for l in cpu_out.split('\n') if l.strip().isdigit()]
    return int(cpu_lines[0]) if cpu_lines else 0

def get_memory_usage():
    mem_out = run_cmd('wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /Value 2>nul')
    total_mem = int(re.search(r'TotalVisibleMemorySize=(\d+)', mem_out).group(1))
    free_mem = int(re.search(r'FreePhysicalMemory=(\d+)', mem_out).group(1))
    used_mem = total_mem - free_mem
    return total_mem, used_mem

def get_disk_usage():
    disk_out = run_cmd('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /Value 2>nul')
    total_disk = int(re.search(r'Size=(\d+)', disk_out).group(1))
    free_disk = int(re.search(r'FreeSpace=(\d+)', disk_out).group(1))
    return total_disk, free_disk

def get_battery_status():
    bat_out = run_cmd('wmic path win32_battery get EstimatedChargeRemaining,BatteryStatus /Value 2>nul')
    bat_match = re.search(r'EstimatedChargeRemaining=(\d+)', bat_out)
    bat_status_match = re.search(r'BatteryStatus=(\d+)', bat_out)
    return (int(bat_match.group(1)) if bat_match else None,
            int(bat_status_match.group(1)) if bat_status_match else None)

def get_top_processes():
    proc_out = run_cmd('wmic process where "WorkingSetSize>10000000" get Name,WorkingSetSize /format:list 2>nul')
    processes = []
    for line in proc_out.split('\n'):
        if line.startswith('Name='):
            name = line[5:].strip()
        elif line.startswith('WorkingSetSize=') and name:
            try:
                mem_bytes = int(line[16:].strip())
                mem_mb = round(mem_bytes / 1024 / 1024, 1)
                processes.append((name, mem_mb))
                name = None
            except:
                pass
    return sorted(processes, key=lambda x: x[1], reverse=True)[:10]

if __name__ == '__main__':
    cpu_load = get_cpu_load()
    total_mem, used_mem = get_memory_usage()
    mem_pct = round((used_mem / total_mem) * 100, 1)
    total_disk, free_disk = get_disk_usage()
    used_disk = total_disk - free_disk
    disk_pct = round((used_disk / total_disk) * 100, 1)
    bat_remain, bat_status = get_battery_status()
    top_procs = get_top_processes()
    
    print('=' * 55)
    print('      WORKSTATION HEALTH REPORT')
    print('=' * 55)
    print()
    print('--- CPU Usage ---')
    print('Load: ' + str(cpu_load) + '%')
    print()
    print('--- Memory Usage ---')
    print('Total: ' + str(round(total_mem/1024/1024, 1)) + ' GB')
    print('Used:  ' + str(round(used_mem/1024/1024, 1)) + ' GB (' + str(mem_pct) + '%)')
    print()
    print('--- Disk Usage (C:) ---')
    print('Total: ' + str(round(total_disk/1024/1024/1024, 1)) + ' GB')
    print('Used:  ' + str(round(used_disk/1024/1024/1024, 1)) + ' GB (' + str(disk_pct) + '%)')
    print()
    print('--- Battery Status ---')
    if bat_remain is not None:
        print('Charge: ' + str(bat_remain) + '%')
        print('Status: ' + ('Discharging' if bat_status == 2 else 'Charging' if bat_status == 1 else str(bat_status)))
    else:
        print('No battery detected (desktop system)')
    print()
    print('--- Top 10 Processes by Memory ---')
    for name, mem in top_procs:
        print(name[:20] + '  ' + str(mem) + ' MB')
    print()
    print('=' * 55)
    print('            END OF REPORT')
    print('=' * 55)
import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";

const HOST_ROOT = "/host";

function isHostMounted(): boolean {
  return fs.existsSync(`${HOST_ROOT}/proc`) && 
         fs.existsSync(`${HOST_ROOT}/sys`) && 
         fs.existsSync(`${HOST_ROOT}/etc`);
}

function readHostFile(path: string, fallback: () => string): string {
  if (fs.existsSync("/proc/1/root")) {
    try {
      const proc1RootPath = `/proc/1/root${path}`;
      if (fs.existsSync(proc1RootPath)) {
        const stats = fs.statSync(proc1RootPath);
        if (stats.isFile()) {
          const content = fs.readFileSync(proc1RootPath, "utf-8");
          if (content && content.trim().length > 0) {
            return content.trim();
          }
        }
      }
    } catch (error: any) {
      // Continue with other methods
    }
  }
  
  const hostPath = `${HOST_ROOT}${path}`;
  
  if (isHostMounted()) {
    try {
      if (fs.existsSync(hostPath)) {
        const stats = fs.statSync(hostPath);
        if (stats.isFile()) {
          const content = fs.readFileSync(hostPath, "utf-8");
          if (content && content.trim().length > 0) {
            return content.trim();
          }
        }
      }
    } catch (error: any) {
      // Continue with fallback
    }
  }
  
  try {
    if (fs.existsSync(path)) {
      const stats = fs.statSync(path);
      if (stats.isFile()) {
        const content = fs.readFileSync(path, "utf-8");
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      }
    }
  } catch (error: any) {
    // Return fallback
  }
  
  return fallback();
}

function getHostCPUInfo(): { model: string; count: number } {
  const cpuInfo = readHostFile("/proc/cpuinfo", () => {
    const cpus = os.cpus();
    return cpus.length > 0 ? `model name\t: ${cpus[0].model}\nprocessor\t: 0` : "";
  });

  if (cpuInfo && cpuInfo.length > 0) {
    const lines = cpuInfo.split("\n");
    
    let modelLine = lines.find((line) => {
      const lower = line.toLowerCase();
      return lower.includes("model name") || 
             (lower.includes("model") && lower.includes("name")) ||
             line.match(/^model\s+name\s*[:=]/i);
    });
    
    if (!modelLine) {
      modelLine = lines.find((line) => line.match(/^model\s+name\s*[:=]/i));
    }
    
    if (!modelLine) {
      modelLine = lines.find((line) => 
        line.includes("Hardware") || 
        line.includes("Processor") ||
        line.includes("CPU implementer")
      );
    }
    
    let model = "Unknown";
    if (modelLine) {
      const match = modelLine.match(/[:=]\s*(.+)/);
      if (match && match[1]) {
        model = match[1].trim();
      } else {
        const parts = modelLine.split(/[:=]/);
        if (parts.length > 1) {
          model = parts.slice(1).join(":").trim();
        } else {
          model = modelLine.trim();
        }
      }
    }
    
    const processorLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("processor") && 
             (trimmed.match(/^processor\s*[:=]/i) || trimmed.match(/^processor\s+\d+/i));
    });
    
    let count = processorLines.length;
    
    if (count === 0) {
      const cpuCountLine = lines.find((line) => line.toLowerCase().includes("cpu(s)"));
      if (cpuCountLine) {
        const match = cpuCountLine.match(/(\d+)/);
        if (match) {
          count = parseInt(match[1]);
        }
      }
      
      if (count === 0) {
        count = os.cpus().length;
      }
    }
    
    return { model: model || "Unknown", count: count || 1 };
  }

  const cpus = os.cpus();
  return { model: cpus[0]?.model || "Unknown", count: cpus.length };
}

function getHostMemory(): { total: number; free: number; available: number } {
  const memInfo = readHostFile("/proc/meminfo", () => {
    return `MemTotal: ${Math.floor(os.totalmem() / 1024)} kB\nMemAvailable: ${Math.floor(os.freemem() / 1024)} kB\nMemFree: ${Math.floor(os.freemem() / 1024)} kB`;
  });

  let total = os.totalmem();
  let free = os.freemem();
  let available = os.freemem();

  if (memInfo && memInfo.length > 0) {
    const lines = memInfo.split("\n");
    const totalLine = lines.find((line) => line.startsWith("MemTotal"));
    const availableLine = lines.find((line) => line.startsWith("MemAvailable"));
    const freeLine = lines.find((line) => line.startsWith("MemFree"));

    if (totalLine) {
      const totalMatch = totalLine.match(/(\d+)/);
      if (totalMatch) {
        total = parseInt(totalMatch[1]) * 1024;
      }
    }

    if (availableLine) {
      const availableMatch = availableLine.match(/(\d+)/);
      if (availableMatch) {
        available = parseInt(availableMatch[1]) * 1024;
      }
    }

    if (freeLine) {
      const freeMatch = freeLine.match(/(\d+)/);
      if (freeMatch) {
        free = parseInt(freeMatch[1]) * 1024;
      }
    }
  }

  return { total, free, available };
}

function getHostCPUUsage(): number {
  try {
    const stat = readHostFile("/proc/stat", () => "");
    
    if (stat && stat.length > 0) {
      const lines = stat.split("\n");
      const cpuLine = lines.find((line) => line.startsWith("cpu "));
      
      if (cpuLine) {
        const parts = cpuLine.trim().split(/\s+/);
        
        if (parts.length >= 5) {
          const user = parseFloat(parts[1]) || 0;
          const nice = parseFloat(parts[2]) || 0;
          const system = parseFloat(parts[3]) || 0;
          const idle = parseFloat(parts[4]) || 0;
          const iowait = parseFloat(parts[5]) || 0;
          const irq = parseFloat(parts[6]) || 0;
          const softirq = parseFloat(parts[7]) || 0;
          const steal = parseFloat(parts[8]) || 0;
          
          const totalIdle = idle + iowait;
          const totalNonIdle = user + nice + system + irq + softirq + steal;
          const total = totalIdle + totalNonIdle;
          
          if (total > 0) {
            const usage = (totalNonIdle / total) * 100;
            return Math.min(Math.max(usage, 0), 100);
          }
        }
      }
    }
  } catch (error) {
    // Fallback to loadavg
  }
  
  const loadAvg = os.loadavg();
  const cpuCount = getHostCPUInfo().count;
  const loadPercent = (loadAvg[0] / cpuCount) * 100;
  return Math.min(loadPercent, 100);
}

function getHostDiskUsage(): number {
  try {
    let rootPath = "/";
    if (fs.existsSync("/proc/1/root")) {
      rootPath = "/proc/1/root/";
    }
    
    try {
      const stats = fs.statfsSync(rootPath);
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      const usage = (used / total) * 100;
      return Math.min(Math.max(usage, 0), 100);
    } catch (e: any) {
      // Fallback
    }
  } catch (error: any) {
    // Return 0 on error
  }
  
  return 0;
}

export async function GET() {
  try {
    const hostMounted = isHostMounted();
    const memory = getHostMemory();
    const cpuInfo = getHostCPUInfo();
    const cpuUsage = getHostCPUUsage();
    const diskUsage = getHostDiskUsage();

    let diskTotal = 0;
    let diskUsed = 0;
    let diskFree = 0;
    try {
      let rootPath = "/";
      if (fs.existsSync("/proc/1/root")) {
        rootPath = "/proc/1/root/";
      }
      const stats = fs.statfsSync(rootPath);
      diskTotal = stats.blocks * stats.bsize;
      diskFree = stats.bavail * stats.bsize;
      diskUsed = diskTotal - diskFree;
    } catch (e) {
      // Keep 0 on error
    }

    return NextResponse.json({
      memory: {
        total: memory.total,
        free: memory.free,
        available: memory.available,
        used: memory.total - memory.available,
      },
      cpu: {
        count: cpuInfo.count,
        usage: cpuUsage,
      },
      disk: {
        total: diskTotal,
        used: diskUsed,
        free: diskFree,
        usage: diskUsage,
      },
      hostMounted,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des infos système:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des informations système" },
      { status: 500 }
    );
  }
}

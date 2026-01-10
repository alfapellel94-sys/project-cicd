import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";

// Base path pour les volumes montés de l'hôte
const HOST_ROOT = "/host";

// Vérifier si les volumes de l'hôte sont montés
function isHostMounted(): boolean {
  return fs.existsSync(`${HOST_ROOT}/proc`) && 
         fs.existsSync(`${HOST_ROOT}/sys`) && 
         fs.existsSync(`${HOST_ROOT}/etc`);
}

// Fonction pour lire un fichier depuis l'hôte (si monté) ou depuis le conteneur
function readHostFile(path: string, fallback: () => string): string {
  const hostPath = `${HOST_ROOT}${path}`;
  
  if (isHostMounted()) {
    try {
      if (fs.existsSync(hostPath)) {
        const content = fs.readFileSync(hostPath, "utf-8");
        if (content && content.trim().length > 0) {
          console.log(`✓ Lecture depuis l'hôte: ${hostPath}`);
          return content.trim();
        }
      }
    } catch (error) {
      console.log(`✗ Erreur lecture ${hostPath}:`, error);
    }
  }
  
  // Fallback: lire depuis le conteneur
  try {
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, "utf-8");
      if (content && content.trim().length > 0) {
        console.log(`⚠ Lecture depuis le conteneur: ${path}`);
        return content.trim();
      }
    }
  } catch (error) {
    console.log(`✗ Erreur lecture ${path}:`, error);
  }
  
  return fallback();
}

// Fonction pour obtenir les infos CPU depuis l'hôte
function getHostCPUInfo(): { model: string; count: number } {
  const cpuInfo = readHostFile("/proc/cpuinfo", () => {
    const cpus = os.cpus();
    return cpus.length > 0 ? `model name\t: ${cpus[0].model}\nprocessor\t: 0` : "";
  });

  if (cpuInfo && cpuInfo.length > 0) {
    const lines = cpuInfo.split("\n");
    
    // Chercher le modèle CPU
    let modelLine = lines.find((line) => 
      line.toLowerCase().includes("model name") || 
      line.includes("Model") ||
      line.match(/^model\s+name\s*:/i)
    );
    
    // Fallback pour ARM
    if (!modelLine) {
      modelLine = lines.find((line) => 
        line.includes("Hardware") || 
        line.includes("Processor") ||
        line.includes("CPU implementer")
      );
    }
    
    let model = "Unknown";
    if (modelLine) {
      const parts = modelLine.split(/[:=]/);
      if (parts.length > 1) {
        model = parts.slice(1).join(":").trim();
      } else {
        model = modelLine.trim();
      }
    }
    
    // Compter les processeurs
    const processorLines = lines.filter((line) => 
      line.trim().startsWith("processor") || 
      line.match(/^processor\s*[:=]/i)
    );
    const count = processorLines.length > 0 ? processorLines.length : os.cpus().length;
    
    return { model: model || "Unknown", count };
  }

  const cpus = os.cpus();
  return { model: cpus[0]?.model || "Unknown", count: cpus.length };
}

// Fonction pour obtenir la mémoire depuis l'hôte
function getHostMemory(): { total: number; free: number } {
  const memInfo = readHostFile("/proc/meminfo", () => {
    return `MemTotal: ${Math.floor(os.totalmem() / 1024)} kB\nMemAvailable: ${Math.floor(os.freemem() / 1024)} kB`;
  });

  let total = os.totalmem();
  let free = os.freemem();

  if (memInfo && memInfo.length > 0) {
    const lines = memInfo.split("\n");
    const totalLine = lines.find((line) => line.startsWith("MemTotal"));
    const freeLine = lines.find((line) => line.startsWith("MemAvailable")) ||
                     lines.find((line) => line.startsWith("MemFree"));

    if (totalLine) {
      const totalMatch = totalLine.match(/(\d+)/);
      if (totalMatch) {
        total = parseInt(totalMatch[1]) * 1024; // Convertir de kB en bytes
      }
    }

    if (freeLine) {
      const freeMatch = freeLine.match(/(\d+)/);
      if (freeMatch) {
        free = parseInt(freeMatch[1]) * 1024; // Convertir de kB en bytes
      }
    }
  }

  return { total, free };
}

// Fonction pour obtenir l'uptime depuis l'hôte
function getHostUptime(): number {
  const uptime = readHostFile("/proc/uptime", () => os.uptime().toString());

  if (uptime && uptime.length > 0) {
    const match = uptime.match(/^(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : os.uptime();
  }
  return os.uptime();
}

// Fonction pour obtenir le hostname depuis l'hôte
function getHostHostname(): string {
  const hostname = readHostFile("/etc/hostname", () => os.hostname());

  if (hostname && hostname.length > 0) {
    // Exclure les IDs de conteneur Docker (12 caractères hexadécimaux)
    if (hostname.match(/^[0-9a-f]{12}$/i)) {
      return os.hostname(); // Fallback si c'est un ID Docker
    }
    return hostname;
  }
  return os.hostname();
}

// Fonction pour obtenir l'OS depuis l'hôte
function getHostOS(): { type: string; release: string } {
  let type = os.type();
  let release = os.release();

  const osRelease = readHostFile("/etc/os-release", () => "");
  const procVersion = readHostFile("/proc/version", () => "");

  if (procVersion && procVersion.length > 0 && !procVersion.includes("linuxkit")) {
    const versionMatch = procVersion.match(/Linux version ([^\s]+)/);
    if (versionMatch) {
      release = versionMatch[1];
      type = "Linux";
    }
  }

  if (osRelease && osRelease.includes("PRETTY_NAME")) {
    const match = osRelease.match(/PRETTY_NAME="?([^"]+)"?/);
    if (match) {
      const prettyName = match[1];
      type = "Linux";
      if (!procVersion || procVersion.includes("linuxkit")) {
        if (prettyName.includes("Ubuntu")) {
          const versionMatch = prettyName.match(/(\d+\.\d+)/);
          release = versionMatch ? `Ubuntu ${versionMatch[1]}` : prettyName;
        } else if (prettyName.includes("Debian")) {
          release = prettyName;
        } else {
          release = prettyName;
        }
      }
    }
  }

  return { type, release };
}

// Fonction pour obtenir la charge CPU depuis l'hôte
function getHostLoadAvg(): number[] {
  const loadAvg = readHostFile("/proc/loadavg", () => os.loadavg().join(" "));

  if (loadAvg && loadAvg.length > 0) {
    const parts = loadAvg.split(/\s+/);
    if (parts.length >= 3) {
      return [
        parseFloat(parts[0]) || 0,
        parseFloat(parts[1]) || 0,
        parseFloat(parts[2]) || 0,
      ];
    }
  }

  return os.loadavg();
}

// Fonction pour obtenir l'architecture depuis l'hôte
function getHostArch(): string {
  const cpuInfo = readHostFile("/proc/cpuinfo", () => "");
  
  if (cpuInfo && cpuInfo.length > 0) {
    const lines = cpuInfo.split("\n");
    const flagsLine = lines.find((line) => line.includes("flags") || line.includes("Features"));
    
    if (flagsLine) {
      if (flagsLine.includes("lm") || flagsLine.includes("x86_64")) {
        return "x64";
      } else if (flagsLine.includes("aarch64")) {
        return "arm64";
      }
    }

    const processorLine = lines.find((line) =>
      line.includes("Processor") ||
      line.includes("CPU architecture") ||
      line.includes("CPU implementer")
    );
    
    if (processorLine) {
      if (processorLine.includes("aarch64") || processorLine.includes("ARMv8")) {
        return "arm64";
      } else if (processorLine.includes("armv7") || processorLine.includes("ARMv7")) {
        return "arm";
      }
    }
  }
  
  return os.arch();
}

// Fonction pour obtenir l'IP de l'hôte
function getHostIP(): string {
  try {
    // Essayer de lire depuis /proc/net/route de l'hôte
    const route = readHostFile("/proc/net/route", () => "");
    
    if (route && route.length > 0) {
      const lines = route.split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[1] === "00000000") { // Route par défaut
          const gatewayHex = parts[2];
          if (gatewayHex && gatewayHex.length === 8) {
            const ip = [
              parseInt(gatewayHex.substring(6, 8), 16),
              parseInt(gatewayHex.substring(4, 6), 16),
              parseInt(gatewayHex.substring(2, 4), 16),
              parseInt(gatewayHex.substring(0, 2), 16),
            ].join(".");
            
            if (ip !== "0.0.0.0") {
              return ip;
            }
          }
        }
      }
    }
  } catch (error) {
    console.log("Erreur lecture /proc/net/route:", error);
  }
  
  // Fallback: utiliser l'IP du conteneur
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces || {})) {
    const iface = interfaces![name];
    if (iface) {
      for (const addr of iface) {
        if (addr.family === "IPv4" && !addr.internal) {
          return addr.address;
        }
      }
    }
  }
  
  return "Non disponible";
}

export async function GET() {
  try {
    const hostMounted = isHostMounted();
    console.log("Volumes hôte montés?", hostMounted);

    const cpuInfo = getHostCPUInfo();
    const memory = getHostMemory();
    const uptime = getHostUptime();
    const hostname = getHostHostname();
    const osInfo = getHostOS();
    const loadAvg = getHostLoadAvg();
    const arch = getHostArch();
    const localIP = getHostIP();

    return NextResponse.json({
      os: {
        type: osInfo.type,
        release: osInfo.release,
        arch,
      },
      cpu: {
        model: cpuInfo.model,
        count: cpuInfo.count,
      },
      memory: {
        total: memory.total,
        free: memory.free,
        used: memory.total - memory.free,
      },
      uptime,
      hostname,
      localIP,
      loadAvg,
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


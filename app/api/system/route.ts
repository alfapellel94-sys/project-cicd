import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

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
  // Avec --pid host, /proc/1/root pointe vers la racine de l'hôte
  // Essayer d'abord cette méthode (plus fiable)
  if (fs.existsSync("/proc/1/root")) {
    try {
      const proc1RootPath = `/proc/1/root${path}`;
      if (fs.existsSync(proc1RootPath)) {
        const content = fs.readFileSync(proc1RootPath, "utf-8");
        if (content && content.trim().length > 0) {
          console.log(`✓ Lecture depuis /proc/1/root: ${path}`);
          return content.trim();
        }
      }
    } catch (error) {
      // Continuer avec les autres méthodes
    }
  }
  
  // Essayer avec les volumes montés
  const hostPath = `${HOST_ROOT}${path}`;
  
  if (isHostMounted()) {
    try {
      if (fs.existsSync(hostPath)) {
        const content = fs.readFileSync(hostPath, "utf-8");
        if (content && content.trim().length > 0) {
          console.log(`✓ Lecture depuis l'hôte (volume): ${hostPath}`);
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
    
    // Chercher le modèle CPU - format: "model name\t: Intel(R) Xeon(R) CPU E5-2673 v4 @ 2.30GHz"
    let modelLine = lines.find((line) => {
      const lower = line.toLowerCase();
      return lower.includes("model name") || 
             (lower.includes("model") && lower.includes("name")) ||
             line.match(/^model\s+name\s*[:=]/i);
    });
    
    // Si pas trouvé, chercher avec tabulation
    if (!modelLine) {
      modelLine = lines.find((line) => line.match(/^model\s+name\s*[:=]/i));
    }
    
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
      // Extraire le modèle après ":" ou "="
      const match = modelLine.match(/[:=]\s*(.+)/);
      if (match && match[1]) {
        model = match[1].trim();
      } else {
        // Si pas de match, prendre toute la ligne après "model name"
        const parts = modelLine.split(/[:=]/);
        if (parts.length > 1) {
          model = parts.slice(1).join(":").trim();
        } else {
          model = modelLine.trim();
        }
      }
    }
    
    // Compter les processeurs - chercher toutes les lignes "processor : 0", "processor : 1", etc.
    const processorLines = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("processor") && 
             (trimmed.match(/^processor\s*[:=]/i) || trimmed.match(/^processor\s+\d+/i));
    });
    
    // Si on trouve des lignes processor, utiliser leur nombre
    // Sinon, chercher "CPU(s)" dans /proc/cpuinfo ou utiliser os.cpus()
    let count = processorLines.length;
    
    if (count === 0) {
      // Essayer de trouver "CPU(s)" dans les lignes
      const cpuCountLine = lines.find((line) => line.toLowerCase().includes("cpu(s)"));
      if (cpuCountLine) {
        const match = cpuCountLine.match(/(\d+)/);
        if (match) {
          count = parseInt(match[1]);
        }
      }
      
      // Si toujours 0, utiliser os.cpus()
      if (count === 0) {
        count = os.cpus().length;
      }
    }
    
    return { model: model || "Unknown", count: count || 1 };
  }

  const cpus = os.cpus();
  return { model: cpus[0]?.model || "Unknown", count: cpus.length };
}

// Fonction pour obtenir la mémoire depuis l'hôte
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
        total = parseInt(totalMatch[1]) * 1024; // Convertir de kB en bytes
      }
    }

    // MemAvailable est la mémoire réellement disponible pour les applications
    if (availableLine) {
      const availableMatch = availableLine.match(/(\d+)/);
      if (availableMatch) {
        available = parseInt(availableMatch[1]) * 1024; // Convertir de kB en bytes
      }
    }

    // MemFree est la mémoire complètement libre
    if (freeLine) {
      const freeMatch = freeLine.match(/(\d+)/);
      if (freeMatch) {
        free = parseInt(freeMatch[1]) * 1024; // Convertir de kB en bytes
      }
    }
  }

  return { total, free, available };
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
  // Essayer d'abord /proc/sys/kernel/hostname (plus fiable avec --pid host)
  let hostname = readHostFile("/proc/sys/kernel/hostname", () => "");
  
  if (hostname && hostname.length > 0 && !hostname.match(/^[0-9a-f]{12}$/i) && hostname !== "host") {
    return hostname.trim();
  }
  
  // Essayer /etc/hostname
  hostname = readHostFile("/etc/hostname", () => "");
  
  if (hostname && hostname.length > 0) {
    // Exclure les IDs de conteneur Docker (12 caractères hexadécimaux)
    if (hostname.match(/^[0-9a-f]{12}$/i) || hostname === "host") {
      // Fallback si c'est un ID Docker
    } else {
      return hostname.trim();
    }
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

// Fonction pour obtenir l'utilisation CPU réelle depuis l'hôte
// Note: Pour un calcul précis, il faudrait deux lectures de /proc/stat avec un délai
// Ici, on utilise une approximation basée sur la charge moyenne
function getHostCPUUsage(): number {
  try {
    // Lire /proc/stat pour obtenir des informations sur le CPU
    const stat = readHostFile("/proc/stat", () => "");
    
    if (stat && stat.length > 0) {
      const lines = stat.split("\n");
      const cpuLine = lines.find((line) => line.startsWith("cpu "));
      
      if (cpuLine) {
        // Format: cpu  user nice system idle iowait irq softirq steal guest guest_nice
        const parts = cpuLine.trim().split(/\s+/);
        
        if (parts.length >= 5) {
          // user, nice, system, idle, iowait, irq, softirq, steal
          const user = parseFloat(parts[1]) || 0;
          const nice = parseFloat(parts[2]) || 0;
          const system = parseFloat(parts[3]) || 0;
          const idle = parseFloat(parts[4]) || 0;
          const iowait = parseFloat(parts[5]) || 0;
          const irq = parseFloat(parts[6]) || 0;
          const softirq = parseFloat(parts[7]) || 0;
          const steal = parseFloat(parts[8]) || 0;
          
          // Total des ticks CPU
          const totalIdle = idle + iowait;
          const totalNonIdle = user + nice + system + irq + softirq + steal;
          const total = totalIdle + totalNonIdle;
          
          // Pourcentage d'utilisation = (non-idle / total) * 100
          // Note: Ceci donne une moyenne depuis le boot, pas l'utilisation actuelle
          // Pour l'utilisation actuelle, il faudrait deux lectures avec un délai
          if (total > 0) {
            const usage = (totalNonIdle / total) * 100;
            return Math.min(Math.max(usage, 0), 100);
          }
        }
      }
    }
  } catch (error) {
    console.log("Erreur lors du calcul de l'utilisation CPU:", error);
  }
  
  // Fallback: utiliser loadavg comme approximation
  // Le load average n'est pas un pourcentage, mais on peut l'utiliser comme indicateur
  // Load average de 1.0 sur 1 CPU = 100% d'utilisation
  const loadAvg = getHostLoadAvg();
  const cpuCount = getHostCPUInfo().count;
  
  // Convertir load average en pourcentage approximatif
  // Load avg représente la charge moyenne sur 1, 5 et 15 minutes
  // On utilise la charge sur 1 minute et on la divise par le nombre de CPUs
  const loadPercent = (loadAvg[0] / cpuCount) * 100;
  
  // Le load average peut être > 100% si le système est surchargé
  // On limite à 100% pour l'affichage
  return Math.min(loadPercent, 100);
}

// Fonction pour obtenir l'architecture depuis l'hôte
function getHostArch(): string {
  // Essayer d'abord /proc/cpuinfo
  const cpuInfo = readHostFile("/proc/cpuinfo", () => "");
  
  if (cpuInfo && cpuInfo.length > 0) {
    const lines = cpuInfo.split("\n");
    
    // Chercher directement "x86_64" ou "aarch64" dans les lignes
    for (const line of lines) {
      if (line.toLowerCase().includes("x86_64") || line.toLowerCase().includes("amd64")) {
        return "x64";
      }
      if (line.toLowerCase().includes("aarch64") || line.toLowerCase().includes("arm64")) {
        return "arm64";
      }
      if (line.toLowerCase().includes("armv7") || line.toLowerCase().includes("armv6")) {
        return "arm";
      }
    }
    
    // Chercher dans les flags
    const flagsLine = lines.find((line) => line.includes("flags") || line.includes("Features"));
    
    if (flagsLine) {
      if (flagsLine.includes("lm") || flagsLine.includes("x86_64")) {
        return "x64";
      } else if (flagsLine.includes("aarch64")) {
        return "arm64";
      }
    }

    // Chercher dans les informations processeur
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
  
  // Essayer /proc/version pour détecter l'architecture
  const procVersion = readHostFile("/proc/version", () => "");
  if (procVersion) {
    if (procVersion.includes("x86_64") || procVersion.includes("amd64")) {
      return "x64";
    }
    if (procVersion.includes("aarch64") || procVersion.includes("arm64")) {
      return "arm64";
    }
  }
  
  return os.arch();
}

// Fonction pour obtenir l'IP de l'hôte
function getHostIP(): string {
  try {
    // Méthode 0: Essayer d'utiliser hostname -i (le plus fiable avec --pid host)
    try {
      if (fs.existsSync("/proc/1/root")) {
        // Avec --pid host, on peut exécuter hostname -i dans l'espace de noms de l'hôte
        const hostnameIP = execSync("hostname -i 2>/dev/null", { encoding: "utf-8", timeout: 2000 }).trim();
        console.log(`hostname -i result: "${hostnameIP}"`);
        if (hostnameIP && hostnameIP.length > 0 && hostnameIP !== "127.0.0.1" && !hostnameIP.includes("::1")) {
          // hostname -i peut retourner plusieurs IPs, prendre la première
          const firstIP = hostnameIP.split(/\s+/)[0];
          if (firstIP && firstIP.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
            console.log(`✓ IP depuis hostname -i: ${firstIP}`);
            return firstIP;
          }
        }
      }
    } catch (e: any) {
      console.log(`hostname -i failed: ${e.message}`);
      // hostname -i n'est pas disponible ou a échoué, continuer avec les autres méthodes
    }
    
    // Méthode 0.5: Essayer de lire depuis /sys/class/net pour trouver les interfaces et leurs IPs
    try {
      const netDir = "/proc/1/root/sys/class/net";
      if (fs.existsSync(netDir)) {
        const interfaces = fs.readdirSync(netDir);
        for (const iface of interfaces) {
          if (iface === "lo") continue; // Ignorer loopback
          
          // Chercher l'adresse IP dans /sys/class/net/iface/address (MAC) puis chercher l'IP
          // Ou mieux: chercher dans /proc/net/route ou /proc/net/fib_trie pour cette interface
          const addrFile = `${netDir}/${iface}/address`;
          if (fs.existsSync(addrFile)) {
            // Cette interface existe, chercher son IP
            // On va utiliser une autre méthode pour trouver l'IP de cette interface
          }
        }
      }
    } catch (e: any) {
      console.log(`Reading /sys/class/net failed: ${e.message}`);
    }
    
    // Méthode 1: Lire depuis /proc/net/fib_trie (contient toutes les IPs locales)
    let fibTrie = readHostFile("/proc/net/fib_trie", () => "");
    if (fibTrie && fibTrie.length > 0) {
      // Parser fib_trie pour trouver les IPs locales
      // Chercher les lignes avec "LOCAL" qui indiquent les IPs locales
      const lines = fibTrie.split("\n");
      const localIPs: string[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Chercher les lignes qui contiennent "LOCAL" et une IP
        if (line.includes("LOCAL")) {
          // L'IP est généralement sur la ligne précédente ou dans la même ligne
          const ipMatch = line.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (ipMatch) {
            const ip = ipMatch[1];
            // Filtrer les IPs invalides
            if (ip !== "127.0.0.1" && ip !== "0.0.0.0" && !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.")) {
              localIPs.push(ip);
            }
          }
          // Aussi chercher dans les lignes précédentes
          if (i > 0) {
            const prevLine = lines[i - 1];
            const prevIpMatch = prevLine.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (prevIpMatch) {
              const ip = prevIpMatch[1];
              if (ip !== "127.0.0.1" && ip !== "0.0.0.0" && !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.")) {
                localIPs.push(ip);
              }
            }
          }
        }
      }
      
      if (localIPs.length > 0) {
        // Retourner la première IP valide (généralement la principale)
        // Préférer les IPs dans les plages privées communes (192.168.x.x, 10.x.x.x)
        const privateIP = localIPs.find(ip => ip.startsWith("192.168.") || ip.startsWith("10."));
        if (privateIP) {
          return privateIP;
        }
        return localIPs[0];
      }
    }
    
    // Méthode 2: Lire depuis /proc/net/route pour trouver l'interface principale puis son IP
    const route = readHostFile("/proc/net/route", () => "");
    if (route && route.length > 0) {
      const lines = route.split("\n");
      // Chercher la première interface non-loopback avec une route par défaut
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4) {
          const iface = parts[0];
          const dest = parts[1];
          const sourceHex = parts[2]; // IP source en hexadécimal
          
          // Ignorer loopback et chercher la route par défaut
          if (iface && iface !== "lo" && dest === "00000000") {
            console.log(`Found default route interface: ${iface}, source hex: ${sourceHex}`);
            
            // Convertir l'IP source de hexadécimal à décimal
            if (sourceHex && sourceHex.length === 8) {
              try {
                const ip = [
                  parseInt(sourceHex.substring(6, 8), 16),
                  parseInt(sourceHex.substring(4, 6), 16),
                  parseInt(sourceHex.substring(2, 4), 16),
                  parseInt(sourceHex.substring(0, 2), 16),
                ].join(".");
                
                if (ip !== "0.0.0.0" && ip !== "127.0.0.1" && !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.")) {
                  console.log(`✓ IP depuis route (source): ${ip}`);
                  return ip;
                }
              } catch (e) {
                console.log(`Error parsing source IP: ${e}`);
              }
            }
            
            // Relire fib_trie si nécessaire
            if (!fibTrie || fibTrie.length === 0) {
              fibTrie = readHostFile("/proc/net/fib_trie", () => "");
            }
            
            // Essayer de trouver l'IP de cette interface dans /proc/net/fib_trie
            if (fibTrie && fibTrie.length > 0) {
              const ifacePattern = new RegExp(`${iface}.*?(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})`, 'i');
              const match = fibTrie.match(ifacePattern);
              if (match && match[1]) {
                const ip = match[1];
                if (ip !== "127.0.0.1" && ip !== "0.0.0.0" && !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.")) {
                  console.log(`✓ IP depuis route + fib_trie: ${ip}`);
                  return ip;
                }
              }
            }
          }
        }
      }
    }
    
    // Méthode 3: Lire depuis /proc/net/arp (contient les IPs des interfaces)
    const arp = readHostFile("/proc/net/arp", () => "");
    if (arp && arp.length > 0) {
      const lines = arp.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 1) {
          const ip = parts[0];
          // Vérifier que c'est une IP valide et non loopback/Docker
          if (ip && ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/) && 
              ip !== "127.0.0.1" && ip !== "0.0.0.0" && 
              !ip.startsWith("172.17.") && !ip.startsWith("172.18.") && !ip.startsWith("172.19.")) {
            return ip;
          }
        }
      }
    }
  } catch (error) {
    console.log("Erreur lors de la récupération de l'IP:", error);
  }
  
  // Fallback: utiliser l'IP du conteneur (si on ne peut pas accéder à l'hôte)
  // Mais filtrer les IPs Docker
  console.log("Trying fallback: os.networkInterfaces()");
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces || {})) {
    const iface = interfaces![name];
    if (iface) {
      for (const addr of iface) {
        console.log(`Checking interface ${name}: ${addr.address} (internal: ${addr.internal}, family: ${addr.family})`);
        if (addr.family === "IPv4" && !addr.internal) {
          // Filtrer les IPs Docker (172.16.0.0/12)
          const ipParts = addr.address.split(".");
          const firstOctet = parseInt(ipParts[0]);
          const secondOctet = parseInt(ipParts[1]);
          
          // IPs Docker: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
          const isDockerIP = firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31;
          
          if (!isDockerIP && addr.address !== "127.0.0.1") {
            console.log(`✓ IP depuis fallback (os.networkInterfaces): ${addr.address}`);
            return addr.address;
          }
        }
      }
    }
  }
  
  console.log("✗ Aucune IP trouvée, retour de 'Non disponible'");
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
    const cpuUsage = getHostCPUUsage();
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
        available: memory.available,
        used: memory.total - memory.available, // Utiliser available au lieu de free
      },
      uptime,
      hostname,
      localIP,
      loadAvg,
      cpuUsage, // Ajouter l'utilisation CPU réelle
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


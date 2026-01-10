"use client";

import React, { useState, useEffect } from "react";

// Interface pour les données système
interface SystemData {
  os: {
    type: string;
    release: string;
    arch: string;
  };
  cpu: {
    model: string;
    count: number;
  };
  memory: {
    total: number;
    free: number;
    used: number;
  };
  uptime: number;
  hostname: string;
  localIP: string;
  loadAvg: number[];
  hostMounted: boolean;
}

// Fonction pour obtenir l'icône SVG selon le type d'information
function getIcon(key: string): React.ReactElement | null {
  const icons: Record<string, React.ReactElement> = {
    "Système d'exploitation": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    "Architecture": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    "Processeur (CPU)": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    "Nom de l'hôte": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    "Adresse IP": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
    "Temps d'activité": (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[key] || null;
}

export default function SystemInfo() {
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch system information");
        }
        return res.json();
      })
      .then((data: SystemData) => {
        setSystemData(data);
      })
      .catch((err) => {
        console.error("Error fetching system info:", err);
        setError("Impossible de charger les informations système.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-center text-gray-600 dark:text-gray-400 py-8">
        Chargement des informations système...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 py-8">
        Erreur: {error}
      </div>
    );
  }

  if (!systemData) {
    return (
      <div className="text-center text-gray-600 dark:text-gray-400 py-8">
        Aucune information système disponible.
      </div>
    );
  }

  const totalMem = systemData.memory.total / 1024 / 1024 / 1024;
  const usedMem = systemData.memory.used / 1024 / 1024 / 1024;
  const freeMem = systemData.memory.free / 1024 / 1024 / 1024;
  const memUsagePercent = (usedMem / totalMem) * 100;

  const cpuCount = systemData.cpu.count;
  const cpuUsagePercent = Math.min((systemData.loadAvg[0] / cpuCount) * 100, 100);

  const systemInfo = [
    {
      label: "Système d'exploitation",
      value: `${systemData.os.type} ${systemData.os.release}`,
      color: "from-blue-500 to-cyan-500",
    },
    {
      label: "Architecture",
      value: systemData.os.arch,
      color: "from-purple-500 to-pink-500",
    },
    {
      label: "Processeur (CPU)",
      value: systemData.cpu.model,
      color: "from-orange-500 to-red-500",
    },
    {
      label: "Nom de l'hôte",
      value: systemData.hostname,
      color: "from-green-500 to-emerald-500",
    },
    {
      label: "Adresse IP",
      value: systemData.localIP,
      color: "from-teal-500 to-cyan-500",
    },
    {
      label: "Temps d'activité",
      value: `${(systemData.uptime / 3600).toFixed(2)} heures`,
      color: "from-indigo-500 to-violet-500",
    },
  ];

  return (
    <>
      {/* Statut de montage des volumes */}
      <div className="text-center mb-4 text-sm">
        {systemData.hostMounted ? (
          <span className="text-green-600 dark:text-green-400">
            ✓ Informations lues depuis l'hôte (volumes montés)
          </span>
        ) : (
          <span className="text-orange-600 dark:text-orange-400">
            ⚠ Informations lues depuis le conteneur (volumes hôte non montés)
          </span>
        )}
      </div>

      {/* Cartes Mémoire et CPU */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Carte Mémoire */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border-2 border-gray-300 dark:border-gray-700 p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                Utilisation de la Mémoire
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {usedMem.toFixed(2)} GB / {totalMem.toFixed(2)} GB utilisés
              </p>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {memUsagePercent.toFixed(1)}%
            </div>
          </div>
          <div className="relative h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-300 dark:border-gray-700">
            <div
              className="absolute inset-y-0 left-0 bg-gray-700 dark:bg-gray-300 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${memUsagePercent}%` }}
            >
              <div className="absolute inset-0 bg-white/10 dark:bg-black/10 animate-shimmer"></div>
            </div>
          </div>
          <div className="flex justify-between mt-3 text-xs text-gray-600 dark:text-gray-400">
            <span>Libre: {freeMem.toFixed(2)} GB</span>
            <span>Totale: {totalMem.toFixed(2)} GB</span>
          </div>
        </div>

        {/* Carte CPU */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border-2 border-gray-300 dark:border-gray-700 p-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
                Utilisation du CPU
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {cpuCount} cœur{cpuCount > 1 ? "s" : ""} disponible{cpuCount > 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {cpuUsagePercent.toFixed(1)}%
            </div>
          </div>
          <div className="relative h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-300 dark:border-gray-700">
            <div
              className="absolute inset-y-0 left-0 bg-gray-700 dark:bg-gray-300 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${cpuUsagePercent}%` }}
            >
              <div className="absolute inset-0 bg-white/10 dark:bg-black/10 animate-shimmer"></div>
            </div>
          </div>
          <div className="flex justify-between mt-3 text-xs text-gray-600 dark:text-gray-400">
            <span>Charge: {systemData.loadAvg[0].toFixed(2)}</span>
            <span>Cœurs: {cpuCount}</span>
          </div>
        </div>
      </div>

      {/* Grille d'informations système */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {systemInfo.map((info, index) => (
          <div
            key={info.label}
            className="group bg-white dark:bg-gray-900 rounded-xl shadow-lg border-2 border-gray-300 dark:border-gray-700 p-4 hover:shadow-xl hover:scale-105 transition-all duration-300 animate-slide-up"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${info.color} mb-3 text-white shadow-md group-hover:scale-110 transition-transform duration-300`}>
              {getIcon(info.label)}
            </div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
              {info.label}
            </h3>
            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">
              {info.value}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}


#!/bin/bash
# ==============================================================================
# SCRIPT DE DÉPLOIEMENT : Déploiement de l'application Santu Hub CICD Test
#
# Ce script déploie automatiquement l'application Next.js sur un serveur Linux.
# Il gère le cycle de vie complet : clonage, build, déploiement et vérification.
#
# FONCTIONNALITÉS PRINCIPALES:
# ============================
# 1. Vérification de l'espace disque disponible
# 2. Clonage automatique du repository Git
# 3. Gestion intelligente des conteneurs existants (arrêt/suppression)
# 4. Construction de l'image Docker
# 5. Déploiement du conteneur
# 6. Vérification de la santé du conteneur après déploiement
# 7. Nettoyage automatique des fichiers temporaires
# 8. Affichage des informations de connexion (IPs publiques/privées)
#
# CONDITIONS ET COMPORTEMENTS:
# ============================
# • PRÉREQUIS OBLIGATOIRES:
#   - Docker doit être installé et en cours d'exécution
#   - Script exécuté en root (sudo ou root)
#   - Accès Internet pour cloner le repository
#   - Espace disque : 2GB total, 1GB disponible (avertissement si insuffisant)
#
# • GESTION DES CONTENEURS EXISTANTS:
#   - Arrête et supprime le conteneur existant avant déploiement
#   - Supprime l'image existante avant rebuild
#
# • CONTENEUR APPLICATION:
#   - Port exposé : 3000 (configurable via APP_PORT)
#   - Restart policy : unless-stopped
#   - Variables d'environnement injectées au démarrage
#
# • VÉRIFICATIONS POST-DÉPLOIEMENT:
#   - Vérifie que le conteneur est en cours d'exécution
#   - Attend jusqu'à 60 secondes que le port soit accessible
#   - Affiche les logs en cas de problème
#
# • NETTOYAGE:
#   - Supprime le dossier cloné après build (économie d'espace)
#
# • INFORMATIONS AFFICHÉES:
#   - IPs publiques IPv4 et IPv6 (si disponibles)
#   - IPs privées du serveur
#   - Commandes utiles pour gestion du conteneur
#   - URLs d'accès à l'application
#
# • GESTION DES ERREURS:
#   - Arrêt immédiat en cas d'erreur critique (set -euo)
#   - Messages d'erreur clairs avec instructions
#   - Logs détaillés pour débogage
#
# PRÉREQUIS:
# ==========
# • Docker installé et en cours d'exécution
#   (Exécuter d'abord: curl -fsSL https://devoups.elyamaje.com/install-tools.sh | sudo bash)
# • Script exécuté en root (sudo ou root)
# • Accès Internet pour cloner le repository Git
# • Espace disque suffisant (2GB recommandé)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/aboubacar3012/santu-hub-cicd/main/public/deploy.sh | sudo bash
#
# Variables d'environnement (optionnelles):
#   APP_REPO_URL         - URL du repository Git (défaut: https://github.com/aboubacar3012/santu-hub-cicd.git)
#   APP_REPO_DIR         - Nom du dossier de clonage (défaut: santu-hub-cicd)
#   APP_IMAGE_NAME       - Nom de l'image Docker (défaut: santu-hub-cicd:latest)
#   APP_CONTAINER_NAME   - Nom du conteneur (défaut: santu-hub-cicd)
#   APP_PORT             - Port de l'application (défaut: 3000)
#
# Exemples:
#   # Déploiement standard
#   curl -fsSL https://raw.githubusercontent.com/aboubacar3012/santu-hub-cicd/main/public/deploy.sh | sudo bash
#
#   # Déploiement avec port personnalisé
#   APP_PORT=8080 \
#     curl -fsSL https://raw.githubusercontent.com/aboubacar3012/santu-hub-cicd/main/public/deploy.sh | sudo bash
#
#   # Déploiement depuis un repository personnalisé
#   APP_REPO_URL=https://github.com/user/custom-repo.git \
#     curl -fsSL https://raw.githubusercontent.com/aboubacar3012/santu-hub-cicd/main/public/deploy.sh | sudo bash
#
# Auteur : Aboubacar DIALLO
# ==============================================================================

set -euo # Exit immediately on error, treat unset variables as error
set -o pipefail # Return pipeline status (status of last command to exit with non-zero)

DATE=$(date +"%Y%m%d-%H%M%S")

# ==============================================================================
# SECTION 1: CONFIGURATION INITIALE ET DÉTECTION DU SYSTÈME
# ==============================================================================

# Détection du système d'exploitation
OS_TYPE=$(grep -w "ID" /etc/os-release 2>/dev/null | cut -d "=" -f 2 | tr -d '"' || echo "unknown")
if [ "$OS_TYPE" = "manjaro" ] || [ "$OS_TYPE" = "manjaro-arm" ] || [ "$OS_TYPE" = "endeavouros" ] || [ "$OS_TYPE" = "cachyos" ]; then
    OS_TYPE="arch"
fi
if [ "$OS_TYPE" = "pop" ] || [ "$OS_TYPE" = "linuxmint" ] || [ "$OS_TYPE" = "zorin" ]; then
    OS_TYPE="ubuntu"
fi
if [ "$OS_TYPE" = "fedora-asahi-remix" ]; then
    OS_TYPE="fedora"
fi

if [ "$OS_TYPE" = "arch" ] || [ "$OS_TYPE" = "archarm" ]; then
    OS_VERSION="rolling"
else
    OS_VERSION=$(grep -w "VERSION_ID" /etc/os-release 2>/dev/null | cut -d "=" -f 2 | tr -d '"' || echo "unknown")
fi

# ==============================================================================
# SECTION 2: COULEURS ET FONCTIONS DE LOGGING
# ==============================================================================

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Fonction pour logger avec timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Fonction pour logger les sections
log_section() {
    echo ""
    echo "============================================================"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "============================================================"
}

# Fonction pour afficher les messages
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    log "INFO: $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    log "SUCCESS: $1"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    log "WARNING: $1"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    log "ERROR: $1"
    exit 1
}

# Vérifier que le script est exécuté en root
if [ "$EUID" -ne 0 ]; then 
    error "Ce script doit être exécuté avec sudo ou en tant que root"
fi

# Vérifier que Docker est installé et en cours d'exécution
if ! command -v docker &> /dev/null; then
    error "Docker n'est pas installé. Exécutez d'abord: curl -fsSL https://devoups.elyamaje.com/install-tools.sh | sudo bash"
fi

if ! docker info &> /dev/null; then
    error "Docker n'est pas en cours d'exécution. Veuillez démarrer Docker."
fi

# ==============================================================================
# SECTION 3: CONFIGURATION PAR DÉFAUT
# ==============================================================================

APP_REPO_URL="${APP_REPO_URL:-https://github.com/aboubacar3012/santu-hub-cicd.git}"
APP_REPO_DIR="${APP_REPO_DIR:-santu-hub-cicd}"
APP_REPO_PATH="/tmp/${APP_REPO_DIR}"

APP_IMAGE_NAME="${APP_IMAGE_NAME:-santu-hub-cicd:latest}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME:-santu-hub-cicd}"
APP_PORT="${APP_PORT:-3000}"

# Vérification de l'espace disque
TOTAL_SPACE=$(df -BG / 2>/dev/null | awk 'NR==2 {print $2}' | sed 's/G//' || echo "0")
AVAILABLE_SPACE=$(df -BG / 2>/dev/null | awk 'NR==2 {print $4}' | sed 's/G//' || echo "0")
# S'assurer que les valeurs sont numériques
if ! [[ "$TOTAL_SPACE" =~ ^[0-9]+$ ]]; then
    TOTAL_SPACE="0"
fi
if ! [[ "$AVAILABLE_SPACE" =~ ^[0-9]+$ ]]; then
    AVAILABLE_SPACE="0"
fi
REQUIRED_TOTAL_SPACE=2
REQUIRED_AVAILABLE_SPACE=1
WARNING_SPACE=false

# Récupération de la version Docker installée (si disponible)
DOCKER_INSTALLED_VERSION="N/A"
if command -v docker &> /dev/null; then
    DOCKER_INSTALLED_VERSION=$(docker --version 2>/dev/null | awk '{print $3}' | sed 's/,//' || echo "N/A")
fi

# ==============================================================================
# SECTION 4: EN-TÊTE D'INSTALLATION
# ==============================================================================

echo ""
echo "=========================================="
echo "   Déploiement Santu Hub CICD - ${DATE}"
echo "=========================================="
echo ""
echo "Welcome to Santu Hub CICD Test Deployer!"
echo "This script will deploy the application for you."
echo "Source code: ${APP_REPO_URL}"

# Vérification de l'espace disque avec affichage des avertissements
if [ "$TOTAL_SPACE" -lt "$REQUIRED_TOTAL_SPACE" ] 2>/dev/null || [ "$AVAILABLE_SPACE" -lt "$REQUIRED_AVAILABLE_SPACE" ] 2>/dev/null; then
    WARNING_SPACE=true
    echo ""
    if [ "$TOTAL_SPACE" -lt "$REQUIRED_TOTAL_SPACE" ] 2>/dev/null; then
        echo "WARNING: Insufficient total disk space!"
        echo ""
        echo "Total disk space:     ${TOTAL_SPACE}GB"
        echo "Required disk space:  ${REQUIRED_TOTAL_SPACE}GB"
        echo ""
    fi
    if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_AVAILABLE_SPACE" ] 2>/dev/null; then
        echo "WARNING: Insufficient available disk space!"
        echo ""
        echo "Available disk space:   ${AVAILABLE_SPACE}GB"
        echo "Required available space: ${REQUIRED_AVAILABLE_SPACE}GB"
        echo ""
    fi
    echo "=================="
    echo "Sleeping for 5 seconds."
    sleep 5
fi

echo ""

# Tableau récapitulatif des informations
echo "---------------------------------------------"
echo "| Operating System  | $OS_TYPE $OS_VERSION"
echo "| Docker            | $DOCKER_INSTALLED_VERSION"
echo "| Available Space   | ${AVAILABLE_SPACE}GB"
echo "| App Port          | $APP_PORT"
echo "---------------------------------------------"
echo ""

# ==============================================================================
# SECTION 5: ÉTAPES DE DÉPLOIEMENT
# ==============================================================================

# ==============================================================================
# ÉTAPE 1/5: Clonage du repository
# ==============================================================================
log_section "Étape 1/5: Clonage du repository"
info "Clonage du repository..."

# Supprimer le dossier existant s'il existe
if [ -d "$APP_REPO_PATH" ]; then
    info "Suppression du dossier existant: $APP_REPO_PATH"
    rm -rf "$APP_REPO_PATH"
fi

# Cloner le repository
if git clone "$APP_REPO_URL" "$APP_REPO_PATH"; then
    success "Repository cloné avec succès dans $APP_REPO_PATH"
else
    error "Échec du clonage du repository"
fi

# ==============================================================================
# ÉTAPE 2/5: Arrêt et suppression du conteneur existant
# ==============================================================================
log_section "Étape 2/5: Gestion du conteneur existant"
info "Gestion du conteneur existant..."

# Vérifier si le conteneur existe (en cours d'exécution ou arrêté)
if docker ps -a --format "{{.Names}}" | grep -q "^${APP_CONTAINER_NAME}$"; then
    info "Conteneur existant détecté: $APP_CONTAINER_NAME"
    
    # Arrêter le conteneur s'il est en cours d'exécution
    if docker ps --format "{{.Names}}" | grep -q "^${APP_CONTAINER_NAME}$"; then
        info "Arrêt du conteneur en cours..."
        if docker stop "$APP_CONTAINER_NAME" &> /dev/null; then
            success "Conteneur arrêté"
        else
            warning "Impossible d'arrêter le conteneur, tentative de suppression forcée"
        fi
    else
        info "Conteneur déjà arrêté"
    fi
    
    # Supprimer le conteneur (forcé)
    info "Suppression du conteneur..."
    if docker rm -f "$APP_CONTAINER_NAME" &> /dev/null; then
        success "Conteneur supprimé avec succès"
    else
        warning "Impossible de supprimer le conteneur (peut-être déjà supprimé)"
    fi
else
    info "Aucun conteneur existant trouvé"
fi

# ==============================================================================
# ÉTAPE 3/5: Vérification et suppression de l'image existante
# ==============================================================================
log_section "Étape 3/5: Gestion de l'image Docker existante"
info "Gestion de l'image Docker existante..."

# Vérifier si l'image existe
if docker images "$APP_IMAGE_NAME" --format "{{.Repository}}:{{.Tag}}" | grep -q "^${APP_IMAGE_NAME}$"; then
    info "Image existante détectée: $APP_IMAGE_NAME"
    
    # Supprimer tous les conteneurs qui utilisent cette image (au cas où)
    CONTAINERS_USING_IMAGE=$(docker ps -a --filter "ancestor=$APP_IMAGE_NAME" --format "{{.Names}}" 2>/dev/null || true)
    if [ -n "$CONTAINERS_USING_IMAGE" ]; then
        info "Suppression des conteneurs utilisant cette image..."
        echo "$CONTAINERS_USING_IMAGE" | while read -r container_name; do
            if [ -n "$container_name" ]; then
                docker stop "$container_name" &> /dev/null || true
                docker rm -f "$container_name" &> /dev/null || true
            fi
        done
    fi
    
    # Supprimer l'image (forcé)
    info "Suppression de l'image..."
    if docker rmi -f "$APP_IMAGE_NAME" &> /dev/null; then
        success "Image supprimée avec succès"
    else
        # Essayer de supprimer par ID si le nom ne fonctionne pas
        IMAGE_ID=$(docker images "$APP_IMAGE_NAME" --format "{{.ID}}" 2>/dev/null | head -n1 || true)
        if [ -n "$IMAGE_ID" ]; then
            if docker rmi -f "$IMAGE_ID" &> /dev/null; then
                success "Image supprimée avec succès (par ID)"
            else
                warning "Impossible de supprimer l'image (peut-être utilisée ailleurs)"
            fi
        else
            warning "Impossible de supprimer l'image (peut-être déjà supprimée)"
        fi
    fi
else
    info "Aucune image existante trouvée"
fi

# ==============================================================================
# ÉTAPE 4/5: Construction de l'image Docker
# ==============================================================================
log_section "Étape 4/5: Construction de l'image Docker"
info "Construction de l'image Docker..."
echo "  Cela peut prendre un certain temps selon les performances de votre serveur..."

if docker build -t "$APP_IMAGE_NAME" "$APP_REPO_PATH"; then
    success "Image Docker $APP_IMAGE_NAME construite avec succès"
else
    error "Échec de la construction de l'image Docker"
fi

# ==============================================================================
# ÉTAPE 5/5: Lancement du conteneur
# ==============================================================================
log_section "Étape 5/5: Déploiement du conteneur"
info "Déploiement du conteneur..."

# Lancer le conteneur
docker run -d \
    --name "$APP_CONTAINER_NAME" \
    -p "${APP_PORT}:${APP_PORT}" \
    -e CONTAINER_PORT="${APP_PORT}" \
    --restart unless-stopped \
    "$APP_IMAGE_NAME"

if [ $? -eq 0 ]; then
    success "Conteneur Docker lancé avec succès"
else
    error "Échec du lancement du conteneur"
fi

# ==============================================================================
# SECTION 6: NETTOYAGE ET VÉRIFICATION
# ==============================================================================

log_section "Nettoyage"
info "Nettoyage..."

if [ -d "$APP_REPO_PATH" ]; then
    rm -rf "$APP_REPO_PATH"
    success "Dossier $APP_REPO_PATH supprimé avec succès"
fi

log_section "Vérification de l'installation"
info "Attente que l'application soit prête..."

# Attendre que le conteneur soit en cours d'exécution
CONTAINER_WAIT=10
CONTAINER_WAITED=0
while [ $CONTAINER_WAITED -lt $CONTAINER_WAIT ]; do
    if docker ps --filter "name=$APP_CONTAINER_NAME" --format "{{.Names}}" | grep -q "^${APP_CONTAINER_NAME}$"; then
        success "Conteneur est en cours d'exécution"
        break
    fi
    sleep 1
    CONTAINER_WAITED=$((CONTAINER_WAITED + 1))
done

# Attendre que le port soit accessible
TIMEOUT=60
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    if timeout 1 bash -c "echo > /dev/tcp/127.0.0.1/$APP_PORT" 2>/dev/null; then
        success "Application est prête sur le port $APP_PORT"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    if [ $((ELAPSED % 10)) -eq 0 ]; then
        info "Attente de l'application... (${ELAPSED}s/${TIMEOUT}s)"
    fi
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    warning "Timeout lors de l'attente de l'application (le conteneur peut toujours être en cours de démarrage)"
    info "Vérifiez les logs avec: docker logs $APP_CONTAINER_NAME"
else
    # Vérifier la santé du conteneur
    sleep 2
    CONTAINER_STATUS=$(docker inspect --format='{{.State.Status}}' "$APP_CONTAINER_NAME" 2>/dev/null || echo "unknown")
    if [ "$CONTAINER_STATUS" = "running" ]; then
        success "Conteneur est en cours d'exécution"
    else
        warning "Statut du conteneur: $CONTAINER_STATUS"
    fi
fi

# ==============================================================================
# SECTION 7: RÉSUMÉ FINAL
# ==============================================================================

log_section "Déploiement terminé"
echo ""
success "Déploiement terminé avec succès!"
echo ""

# Récupération des IPs publiques et privées
info "Récupération des informations réseau..."

IPV4_TMP=$(mktemp)
IPV6_TMP=$(mktemp)
curl -4s --max-time 5 https://ifconfig.io > "$IPV4_TMP" 2>/dev/null &
IPV4_PID=$!
curl -6s --max-time 5 https://ifconfig.io > "$IPV6_TMP" 2>/dev/null &
IPV6_PID=$!
wait $IPV4_PID 2>/dev/null || true
wait $IPV6_PID 2>/dev/null || true
IPV4_PUBLIC_IP=$(cat "$IPV4_TMP" 2>/dev/null | head -n1 || true)
IPV6_PUBLIC_IP=$(cat "$IPV6_TMP" 2>/dev/null | head -n1 || true)
rm -f "$IPV4_TMP" "$IPV6_TMP"

set +e
DEFAULT_PRIVATE_IP=$(ip route get 1 2>/dev/null | sed -n 's/^.*src \([0-9.]*\) .*$/\1/p' || true)
PRIVATE_IPS=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) print $i}' || ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)
set -e

echo -e "${MAGENTA}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     Santu Hub CICD Test - Déploiement réussi                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

info "Résumé du déploiement:"
echo "  • Conteneur:           $APP_CONTAINER_NAME"
echo "  • Port:               $APP_PORT"
echo "  • Système:            $OS_TYPE $OS_VERSION"
echo ""

if [ -n "$IPV4_PUBLIC_IP" ]; then
    info "Accès à l'application via IPv4 publique:"
    echo "  http://$IPV4_PUBLIC_IP:$APP_PORT"
    echo ""
fi

if [ -n "$IPV6_PUBLIC_IP" ]; then
    info "Accès à l'application via IPv6 publique:"
    echo "  http://[$IPV6_PUBLIC_IP]:$APP_PORT"
    echo ""
fi

if [ -n "$PRIVATE_IPS" ]; then
    info "Accès à l'application via IPs privées:"
    for IP in $PRIVATE_IPS; do
        if [ -n "$IP" ] && [ "$IP" != "$DEFAULT_PRIVATE_IP" ]; then
            echo "  http://$IP:$APP_PORT"
        elif [ -n "$IP" ]; then
            echo "  http://$IP:$APP_PORT (par défaut)"
        fi
    done
    echo ""
fi

info "Commandes utiles:"
echo "  • Vérifier le statut du conteneur:"
echo "    docker ps --filter name=$APP_CONTAINER_NAME"
echo ""
echo "  • Voir les logs de l'application:"
echo "    docker logs -f $APP_CONTAINER_NAME"
echo ""
echo "  • Arrêter l'application:"
echo "    docker stop $APP_CONTAINER_NAME"
echo ""
echo "  • Redémarrer l'application:"
echo "    docker restart $APP_CONTAINER_NAME"
echo ""
echo "  • Supprimer l'application:"
echo "    docker stop $APP_CONTAINER_NAME && docker rm $APP_CONTAINER_NAME"
echo ""

log "Déploiement terminé avec succès"
log "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

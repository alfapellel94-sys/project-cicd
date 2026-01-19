#!/bin/bash
# ==============================================================================
# SCRIPT DE SUPPRESSION D'UTILISATEURS : Suppression des utilisateurs DevOps
#
# Ce script supprime les utilisateurs DevOps créés par createUsers.sh.
# Il supprime également leurs répertoires home et fichiers de configuration.
#
# FONCTIONNALITÉS PRINCIPALES:
# ============================
# 1. Suppression des 15 utilisateurs DevOps (devops-user-01 à devops-user-15)
# 2. Suppression des répertoires home
# 3. Suppression des fichiers de limites dans /etc/security/limits.d/
# 4. Vérification des prérequis (root)
# 5. Affichage du résumé des suppressions
#
# CONDITIONS ET COMPORTEMENTS:
# ============================
# • PRÉREQUIS OBLIGATOIRES:
#   - Script exécuté en root (sudo ou root)
#
# • UTILISATEURS SUPPRIMÉS:
#   - 15 utilisateurs DevOps (devops-user-01 à devops-user-15)
#   - Répertoires home supprimés
#   - Fichiers de limites supprimés
#
# • GESTION DES ERREURS:
#   - Continue même si un utilisateur n'existe pas
#   - Messages d'erreur clairs avec instructions
#
# PRÉREQUIS:
# ==========
# • Script exécuté en root (sudo ou root)
#
# Usage:
#   sudo ./deleteUsers.sh  # Supprime les 15 utilisateurs DevOps
#
# Exemple:
#   sudo ./deleteUsers.sh  # Supprime devops-user-01 à devops-user-15
#
# Auteur : Inspiré de createUsers.sh
# ==============================================================================

set -euo # Exit immediately on error, treat unset variables as error
set -o pipefail # Return pipeline status (status of last command to exit with non-zero)

DATE=$(date +"%Y%m%d-%H%M%S")

# ==============================================================================
# SECTION 1: COULEURS ET FONCTIONS DE LOGGING
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

# ==============================================================================
# SECTION 2: VÉRIFICATIONS PRÉALABLES
# ==============================================================================

# Vérifier que le script est exécuté en root
if [ "$EUID" -ne 0 ]; then 
    error "Ce script doit être exécuté avec sudo ou en tant que root"
fi

# ==============================================================================
# SECTION 3: SUPPRESSION DES UTILISATEURS DEVOPS
# ==============================================================================

delete_devops_users() {
    log_section "Suppression des utilisateurs DevOps"
    
    # Définir la liste des utilisateurs DevOps
    DEVOPS_USERS=(
        "devops-user-01"
        "devops-user-02"
        "devops-user-03"
        "devops-user-04"
        "devops-user-05"
        "devops-user-06"
        "devops-user-07"
        "devops-user-08"
        "devops-user-09"
        "devops-user-10"
        "devops-user-11"
        "devops-user-12"
        "devops-user-13"
        "devops-user-14"
        "devops-user-15"
    )
    
    for USERNAME in "${DEVOPS_USERS[@]}"; do
        delete_user "$USERNAME"
    done
    
    return 0
}

# ==============================================================================
# SECTION 4: FONCTION POUR SUPPRIMER UN UTILISATEUR
# ==============================================================================

delete_user() {
    local USERNAME="$1"
    
    # Vérifier si l'utilisateur existe
    if ! id "$USERNAME" > /dev/null 2>&1; then
        warning "L'utilisateur $USERNAME n'existe pas. Ignoré."
        return 0
    fi
    
    info "Suppression de l'utilisateur : $USERNAME"
    
    # Arrêter tous les processus de l'utilisateur
    if pgrep -u "$USERNAME" > /dev/null 2>&1; then
        warning "Arrêt des processus de $USERNAME..."
        killall -u "$USERNAME" 2>/dev/null || true
        sleep 1
        # Forcer l'arrêt si nécessaire
        killall -9 -u "$USERNAME" 2>/dev/null || true
        sleep 1
    fi
    
    # Supprimer l'utilisateur et son répertoire home
    if userdel -r "$USERNAME" 2>/dev/null; then
        success "Utilisateur $USERNAME supprimé avec succès"
    else
        warning "Échec de la suppression normale de $USERNAME, tentative de suppression forcée..."
        # Tentative de suppression forcée
        killall -u "$USERNAME" 2>/dev/null || true
        sleep 1
        if userdel -rf "$USERNAME" 2>/dev/null; then
            success "Utilisateur $USERNAME supprimé avec succès (forcé)"
        else
            warning "Impossible de supprimer complètement $USERNAME"
        fi
    fi
    
    # Supprimer le fichier de limites s'il existe
    LIMITS_FILE="/etc/security/limits.d/${USERNAME}.conf"
    if [ -f "$LIMITS_FILE" ]; then
        if rm -f "$LIMITS_FILE" 2>/dev/null; then
            success "Fichier de limites supprimé pour $USERNAME"
        else
            warning "Impossible de supprimer le fichier de limites pour $USERNAME"
        fi
    fi
    
    # Supprimer les fichiers systemd user slice s'ils existent
    SYSTEMD_SLICE="/etc/systemd/system/user-${USERNAME}.slice.d"
    if [ -d "$SYSTEMD_SLICE" ]; then
        if rm -rf "$SYSTEMD_SLICE" 2>/dev/null; then
            success "Fichiers systemd supprimés pour $USERNAME"
        fi
    fi
    
    USERS_DELETED+=("$USERNAME")
    echo ""
}

# ==============================================================================
# SECTION 5: EXÉCUTION PRINCIPALE
# ==============================================================================

# Initialiser le tableau des utilisateurs supprimés
USERS_DELETED=()

# Supprimer les utilisateurs DevOps
delete_devops_users

# ==============================================================================
# SECTION 6: RÉSUMÉ FINAL
# ==============================================================================

log_section "Résumé de la suppression"
echo ""
success "Suppression terminée!"
echo ""

if [ ${#USERS_DELETED[@]} -eq 0 ]; then
    warning "Aucun utilisateur DevOps n'a été trouvé ou supprimé."
else
    info "Utilisateurs supprimés (${#USERS_DELETED[@]}):"
    for USERNAME in "${USERS_DELETED[@]}"; do
        echo "  • $USERNAME"
    done
    echo ""
fi

info "Éléments supprimés pour chaque utilisateur:"
echo "  • Utilisateur et répertoire home"
echo "  • Fichier de limites (/etc/security/limits.d/)"
echo "  • Fichiers systemd user slice (si présents)"
echo ""

info "Commandes utiles:"
echo "  • Vérifier les utilisateurs DevOps restants:"
echo "    cat /etc/passwd | grep devops-user"
echo ""
echo "  • Vérifier les fichiers de limites restants:"
echo "    ls -la /etc/security/limits.d/ | grep devops-user"
echo ""

log "Suppression terminée avec succès"
log "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

#### USAGE EXAMPLE ####
# Télécharger le script:
# curl -fsSL -o deleteUsers.sh https://raw.githubusercontent.com/aboubacar3012/santu-hub-cicd/main/public/deleteUsers.sh
# chmod +x deleteUsers.sh
#
# Supprimer les 15 utilisateurs DevOps:
# sudo ./deleteUsers.sh

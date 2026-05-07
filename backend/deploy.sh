#!/usr/bin/env bash
# Manual deploy del backend a Cloud Run via Cloud Build.
# Requiere: gcloud autenticado con permiso de owner/editor en sbc-lovable, y git instalado.
#
# Uso:
#   ./deploy.sh                           # tag = <git-sha>-<timestamp>
#   ./deploy.sh v1.2.3                    # tag custom
#   PROJECT=otro-proyecto ./deploy.sh     # override del proyecto (default sbc-lovable)

set -euo pipefail

PROJECT="${PROJECT:-sbc-lovable}"
cd "$(dirname "$0")"

if [ -n "${1-}" ]; then
  TAG="$1"
else
  SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
  TAG="${SHA}-$(date -u +%Y%m%d%H%M%S)"
fi

IMAGE="us-central1-docker.pkg.dev/${PROJECT}/informegmf/backend:${TAG}"

echo ">> proyecto:  ${PROJECT}"
echo ">> tag:       ${TAG}"
echo ">> imagen:    ${IMAGE}"
echo

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_IMAGE="${IMAGE}" \
  --project="${PROJECT}" \
  .

#!/usr/bin/env bash
set -euo pipefail

IMAGE_REF="${1:-}"
if [[ -z "${IMAGE_REF}" ]]; then
  echo "Usage: $0 <image-ref>" >&2
  exit 2
fi

WORK_DIR="$(mktemp -d)"
CONTAINER_NAME="v2m-addon-smoke-${RANDOM}-${RANDOM}"
LOG_FILE="${WORK_DIR}/container.log"
OPTIONS_FILE="${WORK_DIR}/options.json"

cleanup() {
  docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

cat > "${OPTIONS_FILE}" <<'JSON'
{
  "username": "smoke-user",
  "password": "smoke-pass",
  "client_id": "smoke-client-id"
}
JSON

echo "Running add-on smoke test for image: ${IMAGE_REF}"
docker pull "${IMAGE_REF}" >/dev/null

container_id="$(docker run -d --rm \
  --name "${CONTAINER_NAME}" \
  -v "${OPTIONS_FILE}:/data/options.json:ro" \
  "${IMAGE_REF}")"

deadline=$((SECONDS + 30))
while [[ "${SECONDS}" -lt "${deadline}" ]]; do
  state="$(docker inspect -f '{{.State.Status}}' "${container_id}")"
  if [[ "${state}" == "exited" || "${state}" == "dead" ]]; then
    break
  fi
  sleep 1
done

docker logs "${container_id}" > "${LOG_FILE}" 2>&1 || true
exit_code="$(docker inspect -f '{{.State.ExitCode}}' "${container_id}" 2>/dev/null || echo 999)"
state="$(docker inspect -f '{{.State.Status}}' "${container_id}" 2>/dev/null || echo missing)"

if [[ "${state}" != "exited" && "${state}" != "dead" ]]; then
  echo "Container did not terminate in time (state=${state})." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

if grep -Eq '/run\.sh: .*not found|/entrypoint\.sh:.*not found|with-contenv: .*not found|bashio: .*not found' "${LOG_FILE}"; then
  echo "Detected startup wiring failure in logs." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

if ! grep -Fq "Starting viessmann2mqtt..." "${LOG_FILE}"; then
  echo "Expected run.sh startup log not found." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

if ! grep -Fq "Reading configuration..." "${LOG_FILE}"; then
  echo "Expected bashio configuration log not found." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

if ! grep -Fq "No MQTT broker configured. Set mqtt_uri or enable the MQTT integration." "${LOG_FILE}"; then
  echo "Expected config-validation exit message not found." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

if [[ "${exit_code}" -eq 0 ]]; then
  echo "Expected non-zero exit for intentional config-validation failure, got 0." >&2
  cat "${LOG_FILE}" >&2
  exit 1
fi

echo "Smoke test passed (startup wiring verified, config-validation exit observed)."

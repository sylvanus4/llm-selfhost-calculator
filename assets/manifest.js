/* Deterministic vLLM deployment-manifest renderers — pure, no DOM, no I/O.
   Consumes a serving spec from LLMCalc.buildServingSpec and emits ready-to-run
   docker-compose / Kubernetes / Helm text. Shared with Node tests (test/vllm.test.cjs). */
(function (root) {
  // YAML double-quoted scalar (args are ASCII flags/ids; quote everything for safety).
  function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

  function dockerCompose(spec) {
    const cmd = spec.args.map(a => "      - " + q(a)).join("\n");
    return [
      "# vLLM 서빙 · docker-compose (llm-selfhost-calculator 생성)",
      "# 요구: NVIDIA Container Toolkit · 게이트 모델이면 HF_TOKEN 환경변수",
      "# 실행: HF_TOKEN=hf_xxx docker compose up -d   (health: curl localhost:" + spec.port + "/health)",
      "services:",
      "  vllm:",
      "    image: " + spec.image,
      "    container_name: vllm-" + spec.servedName,
      "    ports:",
      '      - "' + spec.port + ':8000"',
      "    environment:",
      "      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN:-}",
      "    volumes:",
      "      - ${HF_HOME:-~/.cache/huggingface}:/root/.cache/huggingface",
      "    ipc: host",
      "    command:",
      cmd,
      "    deploy:",
      "      resources:",
      "        reservations:",
      "          devices:",
      "            - driver: nvidia",
      "              count: " + spec.gpuCount,
      "              capabilities: [gpu]",
      "    restart: unless-stopped",
      "",
    ].join("\n");
  }

  function k8sManifest(spec) {
    const args = spec.args.map(a => "            - " + q(a)).join("\n");
    const app = "vllm-" + spec.servedName;
    return [
      "# vLLM 서빙 · Kubernetes Deployment + Service (llm-selfhost-calculator 생성)",
      "# 요구: NVIDIA device plugin · (게이트 모델) kubectl create secret generic hf-token --from-literal=token=hf_xxx",
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      "  name: " + app,
      "  labels:",
      "    app: " + app,
      "spec:",
      "  replicas: 1",
      "  selector:",
      "    matchLabels:",
      "      app: " + app,
      "  template:",
      "    metadata:",
      "      labels:",
      "        app: " + app,
      "    spec:",
      "      containers:",
      "        - name: vllm",
      "          image: " + spec.image,
      "          args:",
      args,
      "          ports:",
      "            - containerPort: 8000",
      "          env:",
      "            - name: HUGGING_FACE_HUB_TOKEN",
      "              valueFrom:",
      "                secretKeyRef:",
      "                  name: hf-token",
      "                  key: token",
      "                  optional: true",
      "          resources:",
      "            limits:",
      "              nvidia.com/gpu: " + spec.gpuCount,
      "          volumeMounts:",
      "            - name: cache",
      "              mountPath: /root/.cache/huggingface",
      "          readinessProbe:",
      "            httpGet:",
      "              path: /health",
      "              port: 8000",
      "            initialDelaySeconds: 60",
      "            periodSeconds: 10",
      "      volumes:",
      "        - name: cache",
      "          emptyDir: {}",
      "---",
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      "  name: " + app,
      "spec:",
      "  selector:",
      "    app: " + app,
      "  ports:",
      "    - port: 8000",
      "      targetPort: 8000",
      "",
    ].join("\n");
  }

  function helmValues(spec) {
    const extra = spec.args.map(a => "          - " + q(a)).join("\n");
    return [
      "# vLLM Helm values 스니펫 (vllm-project/production-stack 계열 차트에 맞춰 조정)",
      "servingEngineSpec:",
      "  modelSpec:",
      "    - name: " + spec.servedName,
      "      repository: " + spec.image.split(":")[0],
      "      tag: " + spec.image.split(":").pop(),
      "      modelURL: " + spec.modelId,
      "      replicaCount: 1",
      "      requestGPU: " + spec.gpuCount,
      "      vllmConfig:",
      "        extraArgs:",
      extra,
      "",
    ].join("\n");
  }

  // ---- Generic engine manifests (SGLang / TensorRT-LLM) ---------------------
  // spec carries a full `command` array (entrypoint + flags), engineLabel, image,
  // port, healthPath, containerName, requirement note. Used for engines whose image
  // needs an explicit launch command (unlike vllm/vllm-openai's implicit entrypoint).
  function engineCompose(spec) {
    const cmd = spec.command.map(a => "      - " + q(a)).join("\n");
    const name = spec.containerName + "-" + spec.servedName;
    return [
      "# " + spec.engineLabel + " 서빙 · docker-compose (llm-selfhost-calculator 생성)",
      "# 요구: " + spec.requirement,
      "# 실행: HF_TOKEN=hf_xxx docker compose up -d   (health: curl localhost:" + spec.port + spec.healthPath + ")",
      "services:",
      "  " + spec.containerName + ":",
      "    image: " + spec.image,
      "    container_name: " + name,
      "    ports:",
      '      - "' + spec.port + ":" + spec.port + '"',
      "    environment:",
      "      - HUGGING_FACE_HUB_TOKEN=${HF_TOKEN:-}",
      "    volumes:",
      "      - ${HF_HOME:-~/.cache/huggingface}:/root/.cache/huggingface",
      "    ipc: host",
      "    command:",
      cmd,
      "    deploy:",
      "      resources:",
      "        reservations:",
      "          devices:",
      "            - driver: nvidia",
      "              count: " + spec.gpuCount,
      "              capabilities: [gpu]",
      "    restart: unless-stopped",
      "",
    ].join("\n");
  }

  function engineK8s(spec) {
    const cmd = spec.command.map(a => "            - " + q(a)).join("\n");
    const app = spec.containerName + "-" + spec.servedName;
    return [
      "# " + spec.engineLabel + " 서빙 · Kubernetes Deployment + Service (llm-selfhost-calculator 생성)",
      "# 요구: NVIDIA device plugin · (게이트 모델) kubectl create secret generic hf-token --from-literal=token=hf_xxx",
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      "  name: " + app,
      "  labels:",
      "    app: " + app,
      "spec:",
      "  replicas: 1",
      "  selector:",
      "    matchLabels:",
      "      app: " + app,
      "  template:",
      "    metadata:",
      "      labels:",
      "        app: " + app,
      "    spec:",
      "      containers:",
      "        - name: " + spec.containerName,
      "          image: " + spec.image,
      "          command:",
      cmd,
      "          ports:",
      "            - containerPort: " + spec.port,
      "          env:",
      "            - name: HUGGING_FACE_HUB_TOKEN",
      "              valueFrom:",
      "                secretKeyRef:",
      "                  name: hf-token",
      "                  key: token",
      "                  optional: true",
      "          resources:",
      "            limits:",
      "              nvidia.com/gpu: " + spec.gpuCount,
      "          volumeMounts:",
      "            - name: cache",
      "              mountPath: /root/.cache/huggingface",
      "          readinessProbe:",
      "            httpGet:",
      "              path: " + spec.healthPath,
      "              port: " + spec.port,
      "            initialDelaySeconds: 90",
      "            periodSeconds: 10",
      "      volumes:",
      "        - name: cache",
      "          emptyDir: {}",
      "---",
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      "  name: " + app,
      "spec:",
      "  selector:",
      "    app: " + app,
      "  ports:",
      "    - port: " + spec.port,
      "      targetPort: " + spec.port,
      "",
    ].join("\n");
  }

  function engineHelm(spec) {
    const cmd = spec.command.map(a => "    - " + q(a)).join("\n");
    return [
      "# " + spec.engineLabel + " Helm values 스니펫 (일반 Deployment 차트에 맞춰 조정)",
      "image:",
      "  repository: " + spec.image.split(":")[0],
      "  tag: " + spec.image.split(":").pop(),
      "model:",
      "  url: " + spec.modelId,
      "  servedName: " + spec.servedName,
      "replicaCount: 1",
      "resources:",
      "  limits:",
      "    nvidia.com/gpu: " + spec.gpuCount,
      "service:",
      "  port: " + spec.port,
      "command:",
      cmd,
      "",
    ].join("\n");
  }

  const api = { dockerCompose, k8sManifest, helmValues, engineCompose, engineK8s, engineHelm };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Manifest = api;
})(typeof self !== "undefined" ? self : this);

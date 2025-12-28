# Monitoring & Observability

**Purpose:** Know when shit breaks before users tell you.

---

## Two Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE                               │
│                                                                  │
│   Server Health         Docker Health        Database Health    │
│   • CPU %               • Container status   • Connection pool  │
│   • RAM %               • Restart count      • Query latency    │
│   • Disk %              • Resource usage     • Replication lag  │
│   • Network I/O         • Log errors         • Deadlocks        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     APPLICATION (Lugh)                           │
│                                                                  │
│   Agent Health          API Health           Business Metrics   │
│   • Active agents       • Response time      • Messages/hour    │
│   • Task queue depth    • Error rate         • Tasks completed  │
│   • Agent failures      • Endpoint status    • Agent utilization│
│   • Memory per agent    • Webhook latency    • Cost per task    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stack (Lightweight)

| Component | Tool | Why |
|-----------|------|-----|
| **Metrics** | Prometheus | Industry standard, free |
| **Dashboards** | Grafana | Beautiful, free |
| **Alerts** | Grafana → Telegram | Alerts to your phone |
| **Logs** | Loki (or just Docker logs) | Keep it simple |
| **Uptime** | Better Uptime / UptimeRobot | External check |

**All free tier compatible.**

---

## Docker Compose Addition

```yaml
# docker-compose.monitoring.yml

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-secure-password
      - GF_SERVER_ROOT_URL=http://54.76.67.56:3002
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3002:3000"
    depends_on:
      - prometheus
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    ports:
      - "9100:9100"
    restart: unless-stopped

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: cadvisor
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    ports:
      - "8080:8080"
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana-data:
```

---

## Prometheus Config

```yaml
# monitoring/prometheus.yml

global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: []

scrape_configs:
  # Server metrics
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']

  # Docker container metrics
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  # Lugh application metrics
  - job_name: 'lugh-staging'
    static_configs:
      - targets: ['lugh-staging:3000']
    metrics_path: '/metrics'

  - job_name: 'lugh-prod'
    static_configs:
      - targets: ['lugh-prod:3000']
    metrics_path: '/metrics'

  # PostgreSQL (if using postgres_exporter)
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
```

---

## Lugh Metrics Endpoint

**Add to Lugh:** `/metrics` endpoint exposing Prometheus format.

```typescript
// src/api/metrics.ts

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

const register = new Registry();

// Counters
export const messagesReceived = new Counter({
  name: 'lugh_messages_received_total',
  help: 'Total messages received',
  labelNames: ['platform', 'type'],
  registers: [register],
});

export const tasksCompleted = new Counter({
  name: 'lugh_tasks_completed_total',
  help: 'Total tasks completed by agents',
  labelNames: ['agent_id', 'status'],
  registers: [register],
});

export const agentErrors = new Counter({
  name: 'lugh_agent_errors_total',
  help: 'Total agent errors',
  labelNames: ['agent_id', 'error_type'],
  registers: [register],
});

// Gauges
export const activeAgents = new Gauge({
  name: 'lugh_active_agents',
  help: 'Number of active agents',
  registers: [register],
});

export const taskQueueDepth = new Gauge({
  name: 'lugh_task_queue_depth',
  help: 'Number of tasks in queue',
  registers: [register],
});

export const activeConversations = new Gauge({
  name: 'lugh_active_conversations',
  help: 'Number of active conversations',
  registers: [register],
});

// Histograms
export const taskDuration = new Histogram({
  name: 'lugh_task_duration_seconds',
  help: 'Task execution duration',
  labelNames: ['task_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const responseLatency = new Histogram({
  name: 'lugh_response_latency_seconds',
  help: 'Response latency to user',
  labelNames: ['platform'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// Express endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## Key Alerts

### Infrastructure Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| High CPU | > 80% for 5 min | Warning |
| High Memory | > 85% for 5 min | Warning |
| Disk Full | > 90% | Critical |
| Container Down | restart_count > 3 in 10 min | Critical |

### Application Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Agent Pool Empty | active_agents == 0 | Critical |
| High Error Rate | errors/min > 10 | Warning |
| Task Queue Backup | queue_depth > 50 | Warning |
| Slow Responses | p95 latency > 30s | Warning |
| Bot Not Responding | no messages in 30 min | Warning |

---

## Telegram Alerting

```yaml
# Grafana alert contact point

apiVersion: 1
contactPoints:
  - orgId: 1
    name: telegram
    receivers:
      - uid: telegram
        type: telegram
        settings:
          bottoken: "YOUR_ALERT_BOT_TOKEN"
          chatid: "YOUR_CHAT_ID"
        disableResolveMessage: false
```

**Create a separate bot for alerts** (@LughAlertsBot) so you don't confuse alerts with regular messages.

---

## Dashboard Panels

### Server Health
- CPU usage (line graph)
- Memory usage (line graph)
- Disk usage (gauge)
- Network I/O (line graph)
- Container status (table)

### Lugh Application
- Messages per minute (line graph)
- Active agents (gauge)
- Task queue depth (line graph)
- Error rate (line graph)
- Response latency p50/p95/p99 (line graph)

### Business Metrics
- Tasks completed today (counter)
- Agent utilization % (gauge)
- Cost estimate (counter)
- Conversations active (gauge)

---

## Quick Health Check (No Grafana)

If you want minimal setup first:

```bash
# Add to crontab - check every 5 min
*/5 * * * * curl -s http://localhost:3000/health || curl -s "https://api.telegram.org/bot<ALERT_BOT_TOKEN>/sendMessage?chat_id=<YOUR_CHAT_ID>&text=🔴 Lugh is DOWN"
```

**That's it.** Alerts to Telegram if Lugh dies.

---

## External Uptime Monitoring

**Free options:**
- [Better Uptime](https://betteruptime.com) - 10 monitors free
- [UptimeRobot](https://uptimerobot.com) - 50 monitors free

**Setup:**
1. Monitor: `http://54.76.67.56:3000/health`
2. Check every 5 minutes
3. Alert to Telegram/Email on down

---

## Implementation Priority

| Task | Effort | Impact |
|------|--------|--------|
| `/health` endpoint | 5 min | High |
| External uptime monitor | 10 min | High |
| Cron alert script | 5 min | Medium |
| `/metrics` endpoint | 30 min | Medium |
| Prometheus + Grafana | 1 hour | Medium |
| Full dashboard | 2 hours | Low (nice to have) |

**Start with:** Health endpoint + external uptime monitor. That covers 80% of "is it working?"
